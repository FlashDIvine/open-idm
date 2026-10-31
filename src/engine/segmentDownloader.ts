import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { DownloadTask, SegmentInfo } from "../types.ts";

export interface ProbeResult {
  url: string;
  finalUrl: string;
  fileName: string;
  fileSize: number;
  supportsRange: boolean;
  etag?: string;
}

export class SegmentDownloader extends EventEmitter {
  private activeStreams: Array<http.ClientRequest> = [];
  private fileHandle: fsp.FileHandle | null = null;
  private isPaused: boolean = false;
  private speedTimer: NodeJS.Timeout | null = null;
  private lastDownloadedBytes: number = 0;
  private lastSpeedCheckTime: number = 0;

  public task: DownloadTask;

  constructor(task: DownloadTask) {
    super();
    this.task = task;
  }

  /**
   * Probe URL for Range support, total size, redirected URL, and filename
   */
  public static async probeUrl(
    targetUrl: string,
    customHeaders: Record<string, string> = {}
  ): Promise<ProbeResult> {
    let currentUrl = targetUrl;
    let redirectsRemaining = 10;

    while (redirectsRemaining > 0) {
      const parsedUrl = new URL(currentUrl);
      const isHttps = parsedUrl.protocol === "https:";
      const client = isHttps ? https : http;

      const options: https.RequestOptions = {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LIDM/1.0",
          Range: "bytes=0-1",
          ...customHeaders,
        },
      };

      const result = await new Promise<{
        statusCode: number;
        headers: http.IncomingHttpHeaders;
      }>((resolve, reject) => {
        const req = client.request(parsedUrl, options, (res) => {
          // Consume first chunk and abort probe to avoid pulling the full file
          res.on("data", () => {});
          res.on("end", () => resolve({ statusCode: res.statusCode || 0, headers: res.headers }));
          res.destroy();
          resolve({ statusCode: res.statusCode || 0, headers: res.headers });
        });
        req.on("error", reject);
        req.end();
      });

      // Follow redirects
      if (
        [301, 302, 303, 307, 308].includes(result.statusCode) &&
        result.headers.location
      ) {
        currentUrl = new URL(result.headers.location, currentUrl).toString();
        redirectsRemaining--;
        continue;
      }

      // Determine range support and file size
      let supportsRange = false;
      let fileSize = -1;

      if (result.statusCode === 206) {
        supportsRange = true;
        const cr = result.headers["content-range"];
        if (cr) {
          const match = cr.match(/\/(\d+|\*)$/);
          if (match && match[1] !== "*") {
            fileSize = parseInt(match[1], 10);
          }
        }
      } else {
        const cl = result.headers["content-length"];
        if (cl) fileSize = parseInt(cl, 10);
        const ar = result.headers["accept-ranges"];
        if (ar && ar.toLowerCase().includes("bytes")) {
          supportsRange = true;
        }
      }

      // Determine filename
      let fileName = "";
      const cd = result.headers["content-disposition"];
      if (cd) {
        const fnMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
        if (fnMatch) fileName = decodeURIComponent(fnMatch[1]);
      }

      if (!fileName) {
        const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
        fileName = pathParts.length > 0 ? decodeURIComponent(pathParts[pathParts.length - 1]) : "download.bin";
      }

      // Strip query parameters from filename
      fileName = fileName.replace(/[?#].*$/, "");

      return {
        url: targetUrl,
        finalUrl: currentUrl,
        fileName,
        fileSize,
        supportsRange,
        etag: typeof result.headers.etag === "string" ? result.headers.etag : undefined,
      };
    }

    throw new Error("Too many redirects probing URL: " + targetUrl);
  }

  /**
   * Initializes or resumes multi-segment download
   */
  public async start(): Promise<void> {
    this.isPaused = false;
    this.task.status = "downloading";
    this.task.updatedAt = Date.now();

    // Ensure save directory exists
    const dir = path.dirname(this.task.savePath);
    await fsp.mkdir(dir, { recursive: true });

    // Open target file for reading and writing at arbitrary byte positions
    if (!fs.existsSync(this.task.savePath)) {
      this.fileHandle = await fsp.open(this.task.savePath, "w+");
      if (this.task.fileSize > 0) {
        // Preallocate file length
        await this.fileHandle.truncate(this.task.fileSize);
      }
    } else {
      this.fileHandle = await fsp.open(this.task.savePath, "r+");
    }

    // Initialize segments if not already set (e.g. fresh download)
    if (this.task.segments.length === 0) {
      this.initSegments();
    }

    this.startSpeedMonitor();

    // Launch workers for each incomplete segment
    const segmentPromises = this.task.segments.map((seg) => this.downloadSegment(seg));

    try {
      await Promise.all(segmentPromises);

      if (!this.isPaused) {
        this.task.status = "completed";
        this.task.progressPercent = 100;
        this.task.speed = 0;
        this.task.eta = 0;
        this.task.updatedAt = Date.now();
        this.cleanup();
        this.emit("completed", this.task);
      }
    } catch (err: any) {
      if (!this.isPaused) {
        this.task.status = "error";
        this.task.error = err.message || String(err);
        this.cleanup();
        this.emit("error", err);
      }
    }
  }

  /**
   * Pause download gracefully
   */
  public async pause(): Promise<void> {
    this.isPaused = true;
    this.task.status = "paused";
    this.task.speed = 0;
    this.task.eta = 0;
    this.task.updatedAt = Date.now();

    // Abort active HTTP streams
    for (const req of this.activeStreams) {
      req.destroy();
    }
    this.activeStreams = [];

    this.cleanup();
    this.emit("paused", this.task);
  }

  private initSegments(): void {
    const total = this.task.fileSize;
    const count = this.task.supportsRange && total > 0 ? this.task.segmentCount : 1;

    this.task.segments = [];
    if (count <= 1 || total <= 0) {
      this.task.segments.push({
        index: 0,
        start: 0,
        end: total > 0 ? total - 1 : -1,
        current: 0,
        downloaded: 0,
        status: "idle",
        speed: 0,
      });
      return;
    }

    const chunkSize = Math.floor(total / count);
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? total - 1 : (i + 1) * chunkSize - 1;
      this.task.segments.push({
        index: i,
        start,
        end,
        current: start,
        downloaded: 0,
        status: "idle",
        speed: 0,
      });
    }
  }

  private async downloadSegment(seg: SegmentInfo): Promise<void> {
    if (seg.end !== -1 && seg.current > seg.end) {
      seg.status = "completed";
      return;
    }

    seg.status = "downloading";
    const parsedUrl = new URL(this.task.url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) LIDM/1.0",
    };

    if (this.task.supportsRange && seg.end !== -1) {
      headers["Range"] = `bytes=${seg.current}-${seg.end}`;
    }

    return new Promise<void>((resolve, reject) => {
      const req = client.request(
        parsedUrl,
        { method: "GET", headers },
        async (res) => {
          if (
            (this.task.supportsRange && res.statusCode !== 206 && res.statusCode !== 200) ||
            (!this.task.supportsRange && res.statusCode !== 200)
          ) {
            return reject(new Error(`Server returned HTTP status ${res.statusCode}`));
          }

          res.on("data", async (chunk: Buffer) => {
            if (this.isPaused) return;

            const writePos = seg.current;
            seg.current += chunk.length;
            seg.downloaded += chunk.length;
            this.task.downloadedBytes += chunk.length;

            if (this.task.fileSize > 0) {
              this.task.progressPercent = Math.min(
                100,
                parseFloat(((this.task.downloadedBytes / this.task.fileSize) * 100).toFixed(2))
              );
            }

            try {
              if (this.fileHandle) {
                await this.fileHandle.write(chunk, 0, chunk.length, writePos);
              }
              this.emit("progress", this.task);
            } catch (err) {
              req.destroy();
              reject(err);
            }
          });

          res.on("end", () => {
            seg.status = "completed";
            resolve();
          });

          res.on("error", (err) => {
            if (this.isPaused) return resolve();
            seg.status = "error";
            reject(err);
          });
        }
      );

      req.on("error", (err) => {
        if (this.isPaused) return resolve();
        seg.status = "error";
        reject(err);
      });

      this.activeStreams.push(req);
      req.end();
    });
  }

  private startSpeedMonitor(): void {
    this.lastSpeedCheckTime = Date.now();
    this.lastDownloadedBytes = this.task.downloadedBytes;

    this.speedTimer = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - this.lastSpeedCheckTime) / 1000;
      if (elapsedSec >= 0.5) {
        const deltaBytes = this.task.downloadedBytes - this.lastDownloadedBytes;
        this.task.speed = Math.max(0, Math.round(deltaBytes / elapsedSec));
        this.lastDownloadedBytes = this.task.downloadedBytes;
        this.lastSpeedCheckTime = now;

        if (this.task.speed > 0 && this.task.fileSize > 0) {
          const remainingBytes = this.task.fileSize - this.task.downloadedBytes;
          this.task.eta = Math.max(0, Math.round(remainingBytes / this.task.speed));
        } else {
          this.task.eta = 0;
        }

        this.emit("speed", {
          speed: this.task.speed,
          eta: this.task.eta,
          progressPercent: this.task.progressPercent,
        });
      }
    }, 500);
  }

  private cleanup(): void {
    if (this.speedTimer) {
      clearInterval(this.speedTimer);
      this.speedTimer = null;
    }
    if (this.fileHandle) {
      this.fileHandle.close().catch(() => {});
      this.fileHandle = null;
    }
  }
}
