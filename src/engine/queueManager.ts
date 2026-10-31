import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { SegmentDownloader } from "./segmentDownloader.ts";
import { CategoryManager } from "../categories/categoryManager.ts";
import type { AppConfig, DownloadCategory, DownloadTask } from "../types.ts";

export const DEFAULT_CONFIG: AppConfig = {
  defaultDownloadDir: path.join(os.homedir(), "Downloads"),
  defaultSegments: 8,
  maxConcurrentDownloads: 3,
  speedLimit: 0,
  clipboardMonitoring: false,
  port: 3030,
};

export class QueueManager extends EventEmitter {
  private tasks: Map<string, DownloadTask> = new Map();
  private activeDownloaders: Map<string, SegmentDownloader> = new Map();
  private stateFilePath: string;
  private categoryManager: CategoryManager;
  private queueRunning: boolean = true;

  public config: AppConfig;

  constructor(config: AppConfig = DEFAULT_CONFIG, stateDir?: string) {
    super();
    this.config = config;
    const dir = stateDir ?? path.join(os.homedir(), ".lidm");
    this.stateFilePath = path.join(dir, "tasks.json");
    this.categoryManager = new CategoryManager(this.config.defaultDownloadDir);
  }

  public async init(): Promise<void> {
    const dir = path.dirname(this.stateFilePath);
    await fsp.mkdir(dir, { recursive: true });
    await this.loadState();
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
  }

  public async addDownload(
    url: string,
    options: {
      fileName?: string;
      category?: DownloadCategory;
      saveDir?: string;
      segmentCount?: number;
      description?: string;
      startImmediately?: boolean;
    } = {}
  ): Promise<DownloadTask> {
    // Probe URL first
    const probe = await SegmentDownloader.probeUrl(url);

    const fileName = options.fileName || probe.fileName || "download.bin";
    const category = options.category || this.categoryManager.detectCategory(fileName);
    const saveDir = options.saveDir || this.categoryManager.getCategoryDirectory(category);
    const savePath = path.join(saveDir, fileName);

    const id = "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

    const task: DownloadTask = {
      id,
      url: probe.finalUrl,
      fileName,
      savePath,
      fileSize: probe.fileSize,
      downloadedBytes: 0,
      progressPercent: 0,
      status: "queued",
      category,
      speed: 0,
      eta: 0,
      segmentCount: options.segmentCount || this.config.defaultSegments,
      segments: [],
      supportsRange: probe.supportsRange,
      etag: probe.etag,
      description: options.description || "",
      siteName: new URL(probe.finalUrl).hostname,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(id, task);
    await this.saveState();
    this.emit("taskAdded", task);

    if (options.startImmediately !== false) {
      this.checkQueue();
    }

    return task;
  }

  public async pauseDownload(id: string): Promise<boolean> {
    const downloader = this.activeDownloaders.get(id);
    if (downloader) {
      await downloader.pause();
      this.activeDownloaders.delete(id);
    }
    const task = this.tasks.get(id);
    if (task) {
      task.status = "paused";
      task.speed = 0;
      task.eta = 0;
      await this.saveState();
      this.emit("taskUpdated", task);
      this.checkQueue();
      return true;
    }
    return false;
  }

  public async resumeDownload(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (task && (task.status === "paused" || task.status === "error" || task.status === "queued")) {
      task.status = "queued";
      await this.saveState();
      this.emit("taskUpdated", task);
      this.checkQueue();
      return true;
    }
    return false;
  }

  public async deleteDownload(id: string, deleteFile: boolean = false): Promise<boolean> {
    await this.pauseDownload(id);
    const task = this.tasks.get(id);
    if (!task) return false;

    if (deleteFile && fs.existsSync(task.savePath)) {
      try {
        await fsp.unlink(task.savePath);
      } catch {}
    }

    this.tasks.delete(id);
    await this.saveState();
    this.emit("taskDeleted", id);
    this.checkQueue();
    return true;
  }

  public startQueue(): void {
    this.queueRunning = true;
    this.checkQueue();
  }

  public stopQueue(): void {
    this.queueRunning = false;
    for (const [id, dl] of this.activeDownloaders.entries()) {
      dl.pause();
      this.activeDownloaders.delete(id);
    }
  }

  private async checkQueue(): Promise<void> {
    if (!this.queueRunning) return;

    const activeCount = this.activeDownloaders.size;
    const slots = this.config.maxConcurrentDownloads - activeCount;
    if (slots <= 0) return;

    // Find next queued tasks
    const queued = Array.from(this.tasks.values()).filter((t) => t.status === "queued");

    for (let i = 0; i < Math.min(slots, queued.length); i++) {
      const task = queued[i];
      const downloader = new SegmentDownloader(task);
      this.activeDownloaders.set(task.id, downloader);

      downloader.on("progress", () => {
        this.emit("taskProgress", task);
      });

      downloader.on("speed", () => {
        this.emit("taskSpeed", task);
      });

      downloader.on("completed", async () => {
        this.activeDownloaders.delete(task.id);
        await this.saveState();
        this.emit("taskCompleted", task);
        this.checkQueue();
      });

      downloader.on("error", async () => {
        this.activeDownloaders.delete(task.id);
        await this.saveState();
        this.emit("taskError", task);
        this.checkQueue();
      });

      // Start asynchronous download without blocking loop
      downloader.start().catch(() => {});
    }
  }

  private async saveState(): Promise<void> {
    try {
      const data = JSON.stringify(Array.from(this.tasks.values()), null, 2);
      await fsp.writeFile(this.stateFilePath, data, "utf-8");
    } catch {}
  }

  private async loadState(): Promise<void> {
    if (!fs.existsSync(this.stateFilePath)) return;
    try {
      const content = await fsp.readFile(this.stateFilePath, "utf-8");
      const list: DownloadTask[] = JSON.parse(content);
      for (const t of list) {
        // If it was downloading before crash/restart, mark as paused
        if (t.status === "downloading" || t.status === "connecting") {
          t.status = "paused";
        }
        t.speed = 0;
        t.eta = 0;
        this.tasks.set(t.id, t);
      }
    } catch {}
  }
}
