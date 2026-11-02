import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import type { DownloadTask, StreamFormatOption, StreamProbeResult } from "../types.ts";

export class StreamDownloader extends EventEmitter {
  private childProcess: ChildProcess | null = null;
  private isPaused: boolean = false;
  public task: DownloadTask;

  constructor(task: DownloadTask) {
    super();
    this.task = task;
  }

  /**
   * Find available yt-dlp binary on the system
   */
  public static findYtDlpBinary(): string {
    const candidates = [
      path.join(os.homedir(), ".local", "bin", "yt-dlp"),
      "/usr/local/bin/yt-dlp",
      "/usr/bin/yt-dlp",
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try {
          fs.accessSync(c, fs.constants.X_OK);
          return c;
        } catch {}
      }
    }
    return "yt-dlp";
  }

  /**
   * Find Node.js executable for yt-dlp JS runtime extraction
   */
  public static findNodeBinary(): string {
    if (process.execPath && fs.existsSync(process.execPath)) {
      return process.execPath;
    }
    const candidates = [
      path.join(os.homedir(), ".nvm", "versions", "node", "v24.19.0", "bin", "node"),
      "/usr/bin/node",
      "/usr/local/bin/node",
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return "node";
  }

  /**
   * Check if URL is a supported streaming service
   */
  public static isStreamUrl(targetUrl: string): boolean {
    try {
      const parsed = new URL(targetUrl);
      const host = parsed.hostname.toLowerCase();
      const streamDomains = [
        "youtube.com",
        "youtu.be",
        "tiktok.com",
        "instagram.com",
        "twitter.com",
        "x.com",
        "facebook.com",
        "fb.watch",
        "vimeo.com",
        "reddit.com",
        "twitch.tv",
        "bilibili.com",
        "dailymotion.com",
        "soundcloud.com",
      ];
      return streamDomains.some((d) => host === d || host.endsWith("." + d));
    } catch {
      return false;
    }
  }

  /**
   * Probe streaming video metadata using yt-dlp
   */
  public static async probeStream(targetUrl: string): Promise<StreamProbeResult> {
    const ytdlp = StreamDownloader.findYtDlpBinary();
    const nodeBin = StreamDownloader.findNodeBinary();

    return new Promise<StreamProbeResult>((resolve, reject) => {
      const args = [
        "--js-runtimes", `node:${nodeBin}`,
        "--dump-json",
        "--no-warnings",
        "--no-playlist",
        targetUrl,
      ];

      const child = spawn(ytdlp, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdoutData = "";
      let stderrData = "";

      child.stdout?.on("data", (chunk) => {
        stdoutData += chunk.toString();
      });

      child.stderr?.on("data", (chunk) => {
        stderrData += chunk.toString();
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to execute yt-dlp: ${err.message}`));
      });

      child.on("close", (code) => {
        if (code !== 0 || !stdoutData.trim()) {
          return reject(
            new Error(
              `yt-dlp metadata probe failed (code ${code}): ${stderrData || "No metadata returned"}`
            )
          );
        }

        try {
          const info = JSON.parse(stdoutData.trim());
          const rawTitle = info.title || "video";
          const sanitizedTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 120);
          const duration = typeof info.duration === "number" ? info.duration : 0;
          const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[info.thumbnails.length - 1].url : undefined);

          // Build format options
          const formats: StreamFormatOption[] = [];

          // 1. Best video + best audio (Recommended)
          formats.push({
            formatId: "bestvideo+bestaudio/best",
            qualityLabel: "⚡ Best Quality (High Definition MP4)",
            ext: "mp4",
          });

          // Check if heights are available in formats list
          const rawFormats: any[] = Array.isArray(info.formats) ? info.formats : [];
          const heights = new Set<number>();
          for (const f of rawFormats) {
            if (typeof f.height === "number" && f.height > 0) {
              heights.add(f.height);
            }
          }

          if (heights.has(1080) || heights.has(1440) || heights.has(2160)) {
            formats.push({
              formatId: "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
              qualityLabel: "🎬 1080p Full HD (MP4)",
              ext: "mp4",
            });
          }

          if (heights.has(720)) {
            formats.push({
              formatId: "bestvideo[height<=720]+bestaudio/best[height<=720]",
              qualityLabel: "🎥 720p HD (MP4)",
              ext: "mp4",
            });
          }

          if (heights.has(480) || heights.has(360)) {
            formats.push({
              formatId: "bestvideo[height<=480]+bestaudio/best[height<=480]",
              qualityLabel: "📱 480p / 360p Standard (MP4)",
              ext: "mp4",
            });
          }

          // Audio only option
          formats.push({
            formatId: "bestaudio/best",
            qualityLabel: "🎵 Audio Only (MP3 High Quality 320k)",
            ext: "mp3",
            isAudioOnly: true,
          });

          resolve({
            url: targetUrl,
            title: rawTitle,
            fileName: `${sanitizedTitle}.mp4`,
            duration,
            thumbnailUrl: thumbnail,
            formats,
            defaultFormat: formats[0].formatId,
            category: "Video",
          });
        } catch (err: any) {
          reject(new Error(`Failed to parse yt-dlp metadata: ${err.message}`));
        }
      });
    });
  }

  /**
   * Parse speed strings like "1.25MiB/s", "500KiB/s", "2.0MB/s" to bytes/sec
   */
  private static parseSpeedToBytes(speedStr: string): number {
    if (!speedStr || speedStr.includes("NA")) return 0;
    const clean = speedStr.trim();
    const match = clean.match(/^([\d.]+)\s*([a-zA-Z/]+)$/);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("kib") || unit.startsWith("kb")) return Math.round(val * 1024);
    if (unit.startsWith("mib") || unit.startsWith("mb")) return Math.round(val * 1024 * 1024);
    if (unit.startsWith("gib") || unit.startsWith("gb")) return Math.round(val * 1024 * 1024 * 1024);
    if (unit.startsWith("b")) return Math.round(val);
    return Math.round(val);
  }

  /**
   * Parse ETA strings like "00:15", "01:20:30" to seconds
   */
  private static parseEtaToSeconds(etaStr: string): number {
    if (!etaStr || etaStr.includes("NA")) return 0;
    const parts = etaStr.trim().split(":").map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  /**
   * Start or resume downloading the stream
   */
  public async start(): Promise<void> {
    this.isPaused = false;
    this.task.status = "downloading";
    this.task.updatedAt = Date.now();

    const saveDir = path.dirname(this.task.savePath);
    await fsp.mkdir(saveDir, { recursive: true });

    const ytdlp = StreamDownloader.findYtDlpBinary();
    const nodeBin = StreamDownloader.findNodeBinary();
    const isAudioOnly = this.task.mediaType === "audio_stream" || this.task.formatId?.includes("bestaudio");
    if (isAudioOnly) {
      if (!this.task.savePath.endsWith(".mp3")) {
        this.task.savePath = this.task.savePath.replace(/\.[a-zA-Z0-9]+$/, "") + ".mp3";
        this.task.fileName = this.task.fileName.replace(/\.[a-zA-Z0-9]+$/, "") + ".mp3";
      }
    } else {
      if (!this.task.savePath.endsWith(".mp4")) {
        this.task.savePath = this.task.savePath.replace(/\.[a-zA-Z0-9]+$/, "") + ".mp4";
        this.task.fileName = this.task.fileName.replace(/\.[a-zA-Z0-9]+$/, "") + ".mp4";
      }
    }

    const formatId = this.task.formatId || "bestvideo+bestaudio/best";

    const args: string[] = [
      "--js-runtimes", `node:${nodeBin}`,
      "--no-playlist",
      "--newline",
      "--continue",
      "--progress-template", "PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s",
      "-f", formatId,
    ];

    if (isAudioOnly) {
      args.push("-x", "--audio-format", "mp3");
    } else {
      args.push("--merge-output-format", "mp4");
    }

    args.push("-o", this.task.savePath);
    args.push(this.task.url);

    this.childProcess = spawn(ytdlp, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderrBuffer = "";

    this.childProcess.stdout?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("PROGRESS:")) {
          // e.g. PROGRESS:  6.4%|   1.18MiB/s|00:06|523264|8205364
          const dataPart = trimmed.slice("PROGRESS:".length);
          const [pctStr, speedStr, etaStr, dlStr, totStr] = dataPart.split("|");

          if (pctStr) {
            const rawPct = parseFloat(pctStr.replace("%", "").trim());
            if (!isNaN(rawPct)) {
              this.task.progressPercent = Math.min(100, Math.max(0, Math.round(rawPct)));
            }
          }

          if (speedStr) {
            this.task.speed = StreamDownloader.parseSpeedToBytes(speedStr);
          }

          if (etaStr) {
            this.task.eta = StreamDownloader.parseEtaToSeconds(etaStr);
          }

          if (dlStr) {
            const dl = parseInt(dlStr.trim(), 10);
            if (!isNaN(dl) && dl > 0) this.task.downloadedBytes = dl;
          }

          if (totStr) {
            const tot = parseInt(totStr.trim(), 10);
            if (!isNaN(tot) && tot > 0) this.task.fileSize = tot;
          }

          this.task.updatedAt = Date.now();
          this.emit("progress", this.task);
          this.emit("speed", this.task);
        }
      }
    });

    this.childProcess.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
    });

    this.childProcess.on("close", async (code) => {
      this.childProcess = null;

      if (this.isPaused) {
        this.task.status = "paused";
        this.task.speed = 0;
        this.task.eta = 0;
        this.task.updatedAt = Date.now();
        return;
      }

      if (code === 0) {
        // Check if output file was created or renamed by merger
        let resolvedPath = this.task.savePath;
        if (!fs.existsSync(resolvedPath)) {
          // Sometimes ffmpeg outputs .mp4, .mp3, or .mkv if extension differed
          const dir = path.dirname(this.task.savePath);
          const baseNoExt = path.basename(this.task.savePath, path.extname(this.task.savePath));
          const candidates = [
            this.task.savePath + ".mp3",
            this.task.savePath + ".mp4",
            path.join(dir, `${baseNoExt}.mp4`),
            path.join(dir, `${baseNoExt}.mp3`),
            path.join(dir, `${baseNoExt}.mkv`),
            path.join(dir, `${baseNoExt}.webm`),
          ];
          for (const c of candidates) {
            if (fs.existsSync(c)) {
              resolvedPath = c;
              this.task.savePath = c;
              this.task.fileName = path.basename(c);
              break;
            }
          }
        }

        try {
          if (fs.existsSync(resolvedPath)) {
            const stat = await fsp.stat(resolvedPath);
            this.task.fileSize = stat.size;
            this.task.downloadedBytes = stat.size;
          }
        } catch {}

        this.task.status = "completed";
        this.task.progressPercent = 100;
        this.task.speed = 0;
        this.task.eta = 0;
        this.task.updatedAt = Date.now();
        this.emit("completed", this.task);
      } else {
        this.task.status = "error";
        this.task.error = stderrBuffer.trim().slice(-300) || `Process exited with code ${code}`;
        this.task.speed = 0;
        this.task.eta = 0;
        this.task.updatedAt = Date.now();
        this.emit("error", new Error(this.task.error));
      }
    });
  }

  /**
   * Pause stream download
   */
  public async pause(): Promise<void> {
    this.isPaused = true;
    if (this.childProcess) {
      try {
        this.childProcess.kill("SIGTERM");
      } catch {}
      this.childProcess = null;
    }
    this.task.status = "paused";
    this.task.speed = 0;
    this.task.eta = 0;
    this.task.updatedAt = Date.now();
  }
}
