#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli.ts
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);
var import_node_http3 = __toESM(require("node:http"), 1);
var import_node_child_process2 = require("node:child_process");

// src/engine/queueManager.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_promises2 = __toESM(require("node:fs/promises"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_events2 = require("node:events");

// src/engine/segmentDownloader.ts
var import_node_http = __toESM(require("node:http"), 1);
var import_node_https = __toESM(require("node:https"), 1);
var import_node_fs = __toESM(require("node:fs"), 1);
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_events = require("node:events");
var SegmentDownloader = class extends import_node_events.EventEmitter {
  activeStreams = [];
  fileHandle = null;
  isPaused = false;
  speedTimer = null;
  lastDownloadedBytes = 0;
  lastSpeedCheckTime = 0;
  task;
  constructor(task) {
    super();
    this.task = task;
  }
  /**
   * Probe URL for Range support, total size, redirected URL, and filename
   */
  static async probeUrl(targetUrl, customHeaders = {}) {
    let currentUrl = targetUrl;
    let redirectsRemaining = 10;
    while (redirectsRemaining > 0) {
      const parsedUrl = new URL(currentUrl);
      const isHttps = parsedUrl.protocol === "https:";
      const client = isHttps ? import_node_https.default : import_node_http.default;
      const options = {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LIDM/1.0",
          Range: "bytes=0-1",
          ...customHeaders
        }
      };
      const result = await new Promise((resolve, reject) => {
        const req = client.request(parsedUrl, options, (res) => {
          res.on("data", () => {
          });
          res.on("end", () => resolve({ statusCode: res.statusCode || 0, headers: res.headers }));
          res.destroy();
          resolve({ statusCode: res.statusCode || 0, headers: res.headers });
        });
        req.on("error", reject);
        req.end();
      });
      if ([301, 302, 303, 307, 308].includes(result.statusCode) && result.headers.location) {
        currentUrl = new URL(result.headers.location, currentUrl).toString();
        redirectsRemaining--;
        continue;
      }
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
      fileName = fileName.replace(/[?#].*$/, "");
      return {
        url: targetUrl,
        finalUrl: currentUrl,
        fileName,
        fileSize,
        supportsRange,
        etag: typeof result.headers.etag === "string" ? result.headers.etag : void 0
      };
    }
    throw new Error("Too many redirects probing URL: " + targetUrl);
  }
  /**
   * Initializes or resumes multi-segment download
   */
  async start() {
    this.isPaused = false;
    this.task.status = "downloading";
    this.task.updatedAt = Date.now();
    const dir = import_node_path.default.dirname(this.task.savePath);
    await import_promises.default.mkdir(dir, { recursive: true });
    if (!import_node_fs.default.existsSync(this.task.savePath)) {
      this.fileHandle = await import_promises.default.open(this.task.savePath, "w+");
      if (this.task.fileSize > 0) {
        await this.fileHandle.truncate(this.task.fileSize);
      }
    } else {
      this.fileHandle = await import_promises.default.open(this.task.savePath, "r+");
    }
    if (this.task.segments.length === 0) {
      this.initSegments();
    }
    this.startSpeedMonitor();
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
    } catch (err) {
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
  async pause() {
    this.isPaused = true;
    this.task.status = "paused";
    this.task.speed = 0;
    this.task.eta = 0;
    this.task.updatedAt = Date.now();
    for (const req of this.activeStreams) {
      req.destroy();
    }
    this.activeStreams = [];
    this.cleanup();
    this.emit("paused", this.task);
  }
  initSegments() {
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
        speed: 0
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
        speed: 0
      });
    }
  }
  async downloadSegment(seg) {
    if (seg.end !== -1 && seg.current > seg.end) {
      seg.status = "completed";
      return;
    }
    seg.status = "downloading";
    const parsedUrl = new URL(this.task.url);
    const client = parsedUrl.protocol === "https:" ? import_node_https.default : import_node_http.default;
    const headers = {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) LIDM/1.0"
    };
    if (this.task.supportsRange && seg.end !== -1) {
      headers["Range"] = `bytes=${seg.current}-${seg.end}`;
    }
    return new Promise((resolve, reject) => {
      const req = client.request(
        parsedUrl,
        { method: "GET", headers },
        async (res) => {
          if (this.task.supportsRange && res.statusCode !== 206 && res.statusCode !== 200 || !this.task.supportsRange && res.statusCode !== 200) {
            return reject(new Error(`Server returned HTTP status ${res.statusCode}`));
          }
          res.on("data", async (chunk) => {
            if (this.isPaused) return;
            const writePos = seg.current;
            seg.current += chunk.length;
            seg.downloaded += chunk.length;
            this.task.downloadedBytes += chunk.length;
            if (this.task.fileSize > 0) {
              this.task.progressPercent = Math.min(
                100,
                parseFloat((this.task.downloadedBytes / this.task.fileSize * 100).toFixed(2))
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
  startSpeedMonitor() {
    this.lastSpeedCheckTime = Date.now();
    this.lastDownloadedBytes = this.task.downloadedBytes;
    this.speedTimer = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - this.lastSpeedCheckTime) / 1e3;
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
          progressPercent: this.task.progressPercent
        });
      }
    }, 500);
  }
  cleanup() {
    if (this.speedTimer) {
      clearInterval(this.speedTimer);
      this.speedTimer = null;
    }
    if (this.fileHandle) {
      this.fileHandle.close().catch(() => {
      });
      this.fileHandle = null;
    }
  }
};

// src/categories/categoryManager.ts
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var CATEGORY_EXTENSIONS = {
  Compressed: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst", "tgz", "iso"],
  Documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "epub", "odt", "ods", "odp", "rtf", "md"],
  Music: ["mp3", "flac", "wav", "aac", "ogg", "m4a", "wma", "opus", "alac"],
  Programs: ["deb", "rpm", "appimage", "sh", "bin", "exe", "apk", "flatpakref", "msi"],
  Video: ["mp4", "mkv", "webm", "avi", "mov", "flv", "wmv", "m4v", "ts", "3gp"]
};
var CategoryManager = class {
  baseDir;
  constructor(baseDir) {
    this.baseDir = baseDir ?? import_node_path2.default.join(import_node_os.default.homedir(), "Downloads");
  }
  detectCategory(fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!ext) return "Documents";
    for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    return "Documents";
  }
  getCategoryDirectory(category) {
    if (category === "All") {
      return this.baseDir;
    }
    return import_node_path2.default.join(this.baseDir, category);
  }
  getDefaultCategories() {
    return ["All", "Compressed", "Documents", "Music", "Programs", "Video"];
  }
};

// src/engine/queueManager.ts
var DEFAULT_CONFIG = {
  defaultDownloadDir: import_node_path3.default.join(import_node_os2.default.homedir(), "Downloads"),
  defaultSegments: 8,
  maxConcurrentDownloads: 3,
  speedLimit: 0,
  clipboardMonitoring: false,
  port: 3030
};
var QueueManager = class extends import_node_events2.EventEmitter {
  tasks = /* @__PURE__ */ new Map();
  activeDownloaders = /* @__PURE__ */ new Map();
  stateFilePath;
  categoryManager;
  queueRunning = true;
  config;
  constructor(config = DEFAULT_CONFIG, stateDir) {
    super();
    this.config = config;
    const dir = stateDir ?? import_node_path3.default.join(import_node_os2.default.homedir(), ".lidm");
    this.stateFilePath = import_node_path3.default.join(dir, "tasks.json");
    this.categoryManager = new CategoryManager(this.config.defaultDownloadDir);
  }
  async init() {
    const dir = import_node_path3.default.dirname(this.stateFilePath);
    await import_promises2.default.mkdir(dir, { recursive: true });
    await this.loadState();
  }
  getTasks() {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
  getTask(id) {
    return this.tasks.get(id);
  }
  async addDownload(url, options = {}) {
    const probe = await SegmentDownloader.probeUrl(url);
    const fileName = options.fileName || probe.fileName || "download.bin";
    const category = options.category || this.categoryManager.detectCategory(fileName);
    const saveDir = options.saveDir || this.categoryManager.getCategoryDirectory(category);
    const savePath = import_node_path3.default.join(saveDir, fileName);
    const id = "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const task = {
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
      updatedAt: Date.now()
    };
    this.tasks.set(id, task);
    await this.saveState();
    this.emit("taskAdded", task);
    if (options.startImmediately !== false) {
      this.checkQueue();
    }
    return task;
  }
  async pauseDownload(id) {
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
  async resumeDownload(id) {
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
  async deleteDownload(id, deleteFile = false) {
    await this.pauseDownload(id);
    const task = this.tasks.get(id);
    if (!task) return false;
    if (deleteFile && import_node_fs2.default.existsSync(task.savePath)) {
      try {
        await import_promises2.default.unlink(task.savePath);
      } catch {
      }
    }
    this.tasks.delete(id);
    await this.saveState();
    this.emit("taskDeleted", id);
    this.checkQueue();
    return true;
  }
  startQueue() {
    this.queueRunning = true;
    this.checkQueue();
  }
  stopQueue() {
    this.queueRunning = false;
    for (const [id, dl] of this.activeDownloaders.entries()) {
      dl.pause();
      this.activeDownloaders.delete(id);
    }
  }
  async checkQueue() {
    if (!this.queueRunning) return;
    const activeCount = this.activeDownloaders.size;
    const slots = this.config.maxConcurrentDownloads - activeCount;
    if (slots <= 0) return;
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
      downloader.start().catch(() => {
      });
    }
  }
  async saveState() {
    try {
      const data = JSON.stringify(Array.from(this.tasks.values()), null, 2);
      await import_promises2.default.writeFile(this.stateFilePath, data, "utf-8");
    } catch {
    }
  }
  async loadState() {
    if (!import_node_fs2.default.existsSync(this.stateFilePath)) return;
    try {
      const content = await import_promises2.default.readFile(this.stateFilePath, "utf-8");
      const list = JSON.parse(content);
      for (const t of list) {
        if (t.status === "downloading" || t.status === "connecting") {
          t.status = "paused";
        }
        t.speed = 0;
        t.eta = 0;
        this.tasks.set(t.id, t);
      }
    } catch {
    }
  }
};

// src/server/webServer.ts
var import_node_http2 = __toESM(require("node:http"), 1);
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_promises3 = __toESM(require("node:fs/promises"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");

// src/search/searchEngine.ts
var DEFAULT_SEARCH_SETTINGS = {
  searchFileName: true,
  searchDescription: false,
  searchSiteOrUrlOrReferer: false,
  matchCase: false,
  matchWholeString: false
};
function extractHostname(url) {
  const schemeIndex = url.indexOf("://");
  const sub = schemeIndex !== -1 ? url.slice(schemeIndex + 3) : url;
  const slashIndex = sub.indexOf("/");
  const hostAndPort = slashIndex !== -1 ? sub.slice(0, slashIndex) : sub;
  const colonIndex = hostAndPort.indexOf(":");
  return colonIndex !== -1 ? hostAndPort.slice(0, colonIndex) : hostAndPort;
}
function matchText(text, query, matchCase, matchWholeString) {
  if (!text || !query) return false;
  const target = matchCase ? text : text.toLowerCase();
  const pattern = matchCase ? query : query.toLowerCase();
  return matchWholeString ? target === pattern : target.includes(pattern);
}
function matchUrl(url, query, matchCase, matchWholeString) {
  if (!url || !query) return false;
  const target = matchCase ? url : url.toLowerCase();
  const pattern = matchCase ? query : query.toLowerCase();
  if (matchWholeString) {
    if (target === pattern) return true;
    const hostname = extractHostname(target);
    return hostname === pattern;
  }
  return target.includes(pattern);
}
function matchTask(task, query, settings = DEFAULT_SEARCH_SETTINGS) {
  const q = query.trim();
  if (!q) return false;
  if (settings.searchFileName && matchText(task.fileName, q, settings.matchCase, settings.matchWholeString)) {
    return true;
  }
  if (settings.searchDescription && matchText(task.description, q, settings.matchCase, settings.matchWholeString)) {
    return true;
  }
  if (settings.searchSiteOrUrlOrReferer) {
    if (matchUrl(task.url, q, settings.matchCase, settings.matchWholeString)) return true;
    if (matchText(task.siteName, q, settings.matchCase, settings.matchWholeString)) return true;
    if (matchUrl(task.referer, q, settings.matchCase, settings.matchWholeString)) return true;
  }
  return false;
}
var DownloadSearchEngine = class {
  cursorIndex = 0;
  lastQuery = "";
  filter(tasks, query, settings = DEFAULT_SEARCH_SETTINGS) {
    const q = query.trim();
    if (!q) {
      return tasks.map((task, index) => ({ matched: true, item: task, index }));
    }
    const results = [];
    tasks.forEach((task, index) => {
      if (matchTask(task, q, settings)) {
        results.push({ matched: true, item: task, index });
      }
    });
    return results;
  }
  findNext(tasks, query, settings = DEFAULT_SEARCH_SETTINGS) {
    const q = query.trim();
    if (!q || tasks.length === 0) return { found: false, index: -1, wrappedAround: false };
    if (q !== this.lastQuery) {
      this.lastQuery = q;
      this.cursorIndex = 0;
    }
    const total = tasks.length;
    const start = this.cursorIndex % total;
    for (let i = start; i < total; i++) {
      if (matchTask(tasks[i], q, settings)) {
        this.cursorIndex = (i + 1) % total;
        return { found: true, index: i, item: tasks[i], wrappedAround: false };
      }
    }
    for (let i = 0; i < start; i++) {
      if (matchTask(tasks[i], q, settings)) {
        this.cursorIndex = (i + 1) % total;
        return { found: true, index: i, item: tasks[i], wrappedAround: true };
      }
    }
    return { found: false, index: -1, wrappedAround: false };
  }
  resetCursor() {
    this.cursorIndex = 0;
  }
};

// src/server/webServer.ts
var import_meta = {};
function getPublicDir() {
  const execDir = import_node_path4.default.dirname(process.execPath);
  const candidateExec = import_node_path4.default.join(execDir, "public");
  if (import_node_fs3.default.existsSync(candidateExec)) return candidateExec;
  try {
    const currentDir = typeof __dirname !== "undefined" ? __dirname : import_node_path4.default.dirname((0, import_node_url.fileURLToPath)(import_meta.url));
    const candidate1 = import_node_path4.default.resolve(currentDir, "../public");
    if (import_node_fs3.default.existsSync(candidate1)) return candidate1;
    const candidate2 = import_node_path4.default.resolve(currentDir, "../../public");
    if (import_node_fs3.default.existsSync(candidate2)) return candidate2;
  } catch {
  }
  const candidateCwd = import_node_path4.default.resolve(process.cwd(), "public");
  if (import_node_fs3.default.existsSync(candidateCwd)) return candidateCwd;
  const candidateFixed = "/home/najib/Dokumen/REA/lidm/public";
  if (import_node_fs3.default.existsSync(candidateFixed)) return candidateFixed;
  return candidateCwd;
}
var PUBLIC_DIR = getPublicDir();
var WebServer = class {
  server = null;
  sseClients = /* @__PURE__ */ new Set();
  searchEngine = new DownloadSearchEngine();
  queue;
  port;
  constructor(queue, port = 3030) {
    this.queue = queue;
    this.port = port;
  }
  async start() {
    await this.queue.init();
    const broadcast = () => {
      if (this.sseClients.size === 0) return;
      const data = JSON.stringify(this.queue.getTasks());
      for (const client of this.sseClients) {
        client.write(`data: ${data}

`);
      }
    };
    this.queue.on("taskProgress", broadcast);
    this.queue.on("taskSpeed", broadcast);
    this.queue.on("taskAdded", broadcast);
    this.queue.on("taskUpdated", broadcast);
    this.queue.on("taskCompleted", broadcast);
    this.queue.on("taskError", broadcast);
    this.queue.on("taskDeleted", broadcast);
    this.server = import_node_http2.default.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = parsedUrl.pathname;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (pathname === "/api/tasks" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(this.queue.getTasks()));
        return;
      }
      if (pathname === "/api/shutdown" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "LIDM server shutting down..." }));
        setTimeout(async () => {
          await this.stop();
          process.exit(0);
        }, 500);
        return;
      }
      if (pathname === "/api/tasks" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        try {
          const task = await this.queue.addDownload(body.url, {
            fileName: body.fileName,
            category: body.category,
            segmentCount: body.segmentCount ? parseInt(body.segmentCount, 10) : void 0,
            description: body.description,
            startImmediately: body.startImmediately ?? true
          });
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify(task));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message || String(err) }));
        }
        return;
      }
      if (pathname === "/api/probe" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        try {
          const probe = await SegmentDownloader.probeUrl(body.url);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(probe));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message || String(err) }));
        }
        return;
      }
      if (pathname.startsWith("/api/tasks/") && pathname.endsWith("/pause") && req.method === "POST") {
        const id = pathname.split("/")[3];
        const ok = await this.queue.pauseDownload(id);
        res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: ok }));
        return;
      }
      if (pathname.startsWith("/api/tasks/") && pathname.endsWith("/resume") && req.method === "POST") {
        const id = pathname.split("/")[3];
        const ok = await this.queue.resumeDownload(id);
        res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: ok }));
        return;
      }
      if (pathname.startsWith("/api/tasks/") && req.method === "DELETE") {
        const id = pathname.split("/")[3];
        const deleteFile = parsedUrl.searchParams.get("deleteFile") === "true";
        const ok = await this.queue.deleteDownload(id, deleteFile);
        res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: ok }));
        return;
      }
      if (pathname === "/api/search" && req.method === "POST") {
        const body = await this.readJsonBody(req);
        const tasks = this.queue.getTasks();
        const settings = body.settings;
        const results = this.searchEngine.filter(tasks, body.query || "", settings);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
        return;
      }
      if (pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        });
        this.sseClients.add(res);
        res.write(`data: ${JSON.stringify(this.queue.getTasks())}

`);
        req.on("close", () => {
          this.sseClients.delete(res);
        });
        return;
      }
      let filePath = import_node_path4.default.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
      if (!import_node_fs3.default.existsSync(filePath)) {
        filePath = import_node_path4.default.join(PUBLIC_DIR, "index.html");
      }
      try {
        const content = await import_promises3.default.readFile(filePath);
        const ext = import_node_path4.default.extname(filePath);
        const mimeTypes = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".ico": "image/x-icon"
        };
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
  readJsonBody(req) {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => data += chunk);
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }
};

// src/mcp/lidmMcpServer.ts
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var LidmMcpServer = class {
  searchEngine = new DownloadSearchEngine();
  queue;
  constructor(queue) {
    this.queue = queue;
  }
  async startStdio() {
    await this.queue.init();
    process.stdin.setEncoding("utf-8");
    let buffer = "";
    process.stdin.on("data", async (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line);
          const res = await this.handleRpc(req);
          if (res) {
            process.stdout.write(JSON.stringify(res) + "\n");
          }
        } catch (err) {
          const errorRes = {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: " + err.message }
          };
          process.stdout.write(JSON.stringify(errorRes) + "\n");
        }
      }
    });
  }
  async handleRpc(req) {
    const { id, method, params } = req;
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "lidm-mcp-server",
              version: "1.0.0"
            },
            capabilities: {
              tools: {}
            }
          }
        };
      case "notifications/initialized":
        return null;
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "lidm_add_download",
                description: "Add a new URL to Linux Internet Download Manager with multi-threaded segmentation",
                inputSchema: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "Direct download URL" },
                    fileName: { type: "string", description: "Optional custom file name" },
                    category: {
                      type: "string",
                      enum: ["Compressed", "Documents", "Music", "Programs", "Video"],
                      description: "Download category"
                    },
                    segmentCount: {
                      type: "number",
                      description: "Number of concurrent segments (1-32, default: 8)"
                    },
                    description: { type: "string", description: "Optional description of download" }
                  },
                  required: ["url"]
                }
              },
              {
                name: "lidm_list_downloads",
                description: "List all active, queued, paused, and completed downloads",
                inputSchema: {
                  type: "object",
                  properties: {
                    category: { type: "string", description: "Optional category filter" }
                  }
                }
              },
              {
                name: "lidm_search_downloads",
                description: "Search downloads using IDM's reverse-engineered search algorithm",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query text" },
                    searchFileName: { type: "boolean", description: "Match file names" },
                    searchDescription: { type: "boolean", description: "Match descriptions" },
                    searchSiteOrUrlOrReferer: { type: "boolean", description: "Match URL / domain / referer" },
                    matchCase: { type: "boolean", description: "Match case sensitive" },
                    matchWholeString: { type: "boolean", description: "Match whole string only" }
                  },
                  required: ["query"]
                }
              },
              {
                name: "lidm_control_download",
                description: "Pause, resume, or delete a download task by ID",
                inputSchema: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Task ID" },
                    action: { type: "string", enum: ["pause", "resume", "delete"], description: "Control action" },
                    deleteFile: { type: "boolean", description: "Whether to delete the downloaded file from disk" }
                  },
                  required: ["id", "action"]
                }
              },
              {
                name: "lidm_probe_url",
                description: "Probe remote URL headers, check Range support, file size, and direct stream links",
                inputSchema: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "URL to probe" }
                  },
                  required: ["url"]
                }
              },
              {
                name: "rea_inspect_binary",
                description: "Inspect a downloaded binary file using REA's reverse engineering tools (file headers, symbols, sections)",
                inputSchema: {
                  type: "object",
                  properties: {
                    path: { type: "string", description: "Path to binary file on disk" },
                    operation: {
                      type: "string",
                      enum: ["file_headers", "section_headers", "symbols"],
                      description: "Inspection operation"
                    }
                  },
                  required: ["path"]
                }
              }
            ]
          }
        };
      case "tools/call": {
        const toolName = params?.name;
        const args = params?.arguments || {};
        try {
          let outputContent = "";
          if (toolName === "lidm_add_download") {
            const task = await this.queue.addDownload(args.url, {
              fileName: args.fileName,
              category: args.category,
              segmentCount: args.segmentCount,
              description: args.description
            });
            outputContent = `Added download "${task.fileName}" (ID: ${task.id}, Size: ${task.fileSize} bytes, Range: ${task.supportsRange}, Segments: ${task.segmentCount})`;
          } else if (toolName === "lidm_list_downloads") {
            let tasks = this.queue.getTasks();
            if (args.category && args.category !== "All") {
              tasks = tasks.filter((t) => t.category === args.category);
            }
            outputContent = JSON.stringify(tasks, null, 2);
          } else if (toolName === "lidm_search_downloads") {
            const allTasks = this.queue.getTasks();
            const settings = {
              searchFileName: args.searchFileName ?? true,
              searchDescription: args.searchDescription ?? false,
              searchSiteOrUrlOrReferer: args.searchSiteOrUrlOrReferer ?? false,
              matchCase: args.matchCase ?? false,
              matchWholeString: args.matchWholeString ?? false
            };
            const results = this.searchEngine.filter(allTasks, args.query, settings);
            outputContent = JSON.stringify(results, null, 2);
          } else if (toolName === "lidm_control_download") {
            if (args.action === "pause") {
              const ok = await this.queue.pauseDownload(args.id);
              outputContent = ok ? `Paused download ${args.id}` : `Task ${args.id} not found`;
            } else if (args.action === "resume") {
              const ok = await this.queue.resumeDownload(args.id);
              outputContent = ok ? `Resumed download ${args.id}` : `Task ${args.id} not found`;
            } else if (args.action === "delete") {
              const ok = await this.queue.deleteDownload(args.id, args.deleteFile);
              outputContent = ok ? `Deleted download ${args.id}` : `Task ${args.id} not found`;
            }
          } else if (toolName === "lidm_probe_url") {
            const probe = await SegmentDownloader.probeUrl(args.url);
            outputContent = JSON.stringify(probe, null, 2);
          } else if (toolName === "rea_inspect_binary") {
            const op = args.operation || "file_headers";
            const flag = op === "symbols" ? "-t" : op === "section_headers" ? "-h" : "-f";
            const { stdout } = await execFileAsync("objdump", [flag, args.path]);
            outputContent = stdout;
          } else {
            throw new Error(`Unknown tool: ${toolName}`);
          }
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: outputContent }]
            }
          };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: "Error: " + (err.message || String(err)) }],
              isError: true
            }
          };
        }
      }
      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }
};

// src/cli.ts
async function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = import_node_http3.default.get(`http://localhost:${port}/api/tasks`, () => {
      resolve(true);
    });
    req.on("error", () => {
      resolve(false);
    });
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}
function openAppWindow(url) {
  const isWindows = process.platform === "win32";
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Public";
    const progFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const progFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const appData = process.env.APPDATA || localAppData;
    const edgeProfile = import_node_path5.default.join(appData, "LIDM", "edge-profile");
    const winCandidates = [
      import_node_path5.default.join(progFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      import_node_path5.default.join(progFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      import_node_path5.default.join(progFiles, "Google", "Chrome", "Application", "chrome.exe"),
      import_node_path5.default.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      import_node_path5.default.join(progFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      import_node_path5.default.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      "msedge.exe",
      "chrome.exe"
    ];
    for (const exe of winCandidates) {
      if (import_node_fs4.default.existsSync(exe) || !exe.includes("\\")) {
        try {
          const child = (0, import_node_child_process2.spawn)(exe, [`--app=${url}`, `--user-data-dir=${edgeProfile}`, "--class=lidm"], {
            detached: true,
            stdio: "ignore",
            windowsHide: true
          });
          child.unref();
          return;
        } catch {
        }
      }
    }
    try {
      const child = (0, import_node_child_process2.spawn)("cmd.exe", ["/c", "start", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
    } catch {
    }
    return;
  }
  const isGui = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!isGui) return;
  const execDir = import_node_path5.default.dirname(process.execPath);
  const possiblePyApps = [
    import_node_path5.default.join(execDir, "bin", "lidm-app.py"),
    import_node_path5.default.join(execDir, "lidm-app.py"),
    "/home/najib/Dokumen/REA/lidm/bin/lidm-app.py"
  ];
  for (const pyApp of possiblePyApps) {
    if (import_node_fs4.default.existsSync(pyApp)) {
      try {
        const child = (0, import_node_child_process2.spawn)("python3", [pyApp, url], {
          detached: true,
          stdio: "ignore",
          env: process.env
        });
        child.unref();
        return;
      } catch {
      }
    }
  }
  const candidates = [
    { cmd: "brave-browser", args: [`--app=${url}`, `--user-data-dir=${import_node_path5.default.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "google-chrome", args: [`--app=${url}`, `--user-data-dir=${import_node_path5.default.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "google-chrome-stable", args: [`--app=${url}`, `--user-data-dir=${import_node_path5.default.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "chromium", args: [`--app=${url}`, `--user-data-dir=${import_node_path5.default.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "chromium-browser", args: [`--app=${url}`, `--user-data-dir=${import_node_path5.default.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "xdg-open", args: [url] },
    { cmd: "firefox", args: [url] }
  ];
  const envPath = process.env.PATH || "/usr/bin:/bin:/usr/local/bin";
  const dirs = envPath.split(":");
  for (const { cmd, args } of candidates) {
    for (const dir of dirs) {
      const fullPath = import_node_path5.default.join(dir, cmd);
      try {
        if (import_node_fs4.default.existsSync(fullPath) && import_node_fs4.default.statSync(fullPath).isFile()) {
          const child = (0, import_node_child_process2.spawn)(fullPath, args, {
            detached: true,
            stdio: "ignore",
            env: process.env
          });
          child.unref();
          return;
        }
      } catch {
      }
    }
  }
}
async function runCli(argv) {
  const args = argv.slice(2);
  const command = args[0] || "ui";
  const queue = new QueueManager(DEFAULT_CONFIG);
  await queue.init();
  switch (command) {
    case "ui": {
      const portIndex = args.indexOf("--port");
      const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : DEFAULT_CONFIG.port;
      if (await isPortInUse(port)) {
        console.log(`[+] LIDM is already running on http://localhost:${port}`);
        console.log("[+] Opening LIDM window...");
        openAppWindow(`http://localhost:${port}`);
        return;
      }
      const webServer = new WebServer(queue, port);
      await webServer.start();
      console.log("===================================================================");
      console.log("  Linux Internet Download Manager (LIDM) - Unlimited Edition");
      console.log("===================================================================");
      console.log(` Web Dashboard: http://localhost:${port}`);
      console.log(" Features: Multi-threaded Dynamic Segmentation (1-32x), Pause/Resume,");
      console.log("           IDM Reverse-Engineered Search Engine, REA MCP Integration.");
      console.log(" Press Ctrl+C to stop.\n");
      openAppWindow(`http://localhost:${port}`);
      break;
    }
    case "server":
    case "start": {
      const portIndex = args.indexOf("--port");
      const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : DEFAULT_CONFIG.port;
      if (await isPortInUse(port)) {
        console.log(`[!] LIDM server is already running on port ${port}.`);
        return;
      }
      const webServer = new WebServer(queue, port);
      await webServer.start();
      console.log(`[+] LIDM background server listening on http://localhost:${port}`);
      break;
    }
    case "stop": {
      const portIndex = args.indexOf("--port");
      const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : DEFAULT_CONFIG.port;
      if (!await isPortInUse(port)) {
        console.log(`[!] LIDM is not running on port ${port}.`);
        return;
      }
      const req = import_node_http3.default.request({
        hostname: "localhost",
        port,
        path: "/api/shutdown",
        method: "POST"
      }, () => {
        console.log("[+] LIDM server stopped successfully.");
      });
      req.on("error", (err) => {
        console.error("[-] Failed to stop LIDM:", err.message);
      });
      req.end();
      break;
    }
    case "mcp": {
      const mcpServer = new LidmMcpServer(queue);
      await mcpServer.startStdio();
      break;
    }
    case "add": {
      const url = args[1];
      if (!url) {
        console.error("Usage: lidm add <url> [--segments <n>] [--category <cat>]");
        process.exit(1);
      }
      const segIdx = args.indexOf("--segments");
      const segments = segIdx !== -1 ? parseInt(args[segIdx + 1], 10) : 8;
      const catIdx = args.indexOf("--category");
      const category = catIdx !== -1 ? args[catIdx + 1] : void 0;
      console.log(`Probing URL: ${url}...`);
      const task = await queue.addDownload(url, {
        segmentCount: segments,
        category,
        startImmediately: true
      });
      console.log(`[+] Added: ${task.fileName}`);
      console.log(`    ID: ${task.id}`);
      console.log(`    Size: ${task.fileSize > 0 ? (task.fileSize / 1024 / 1024).toFixed(2) + " MB" : "Unknown"}`);
      console.log(`    Segments: ${task.segmentCount} (Multi-threaded)`);
      console.log(`    Save Path: ${task.savePath}`);
      break;
    }
    case "list": {
      const tasks = queue.getTasks();
      if (tasks.length === 0) {
        console.log("No downloads found.");
        return;
      }
      console.log("ID		Status		Progress	Speed		File Name");
      console.log("-------------------------------------------------------------------------");
      tasks.forEach((t) => {
        const speed = t.speed > 0 ? (t.speed / 1024).toFixed(1) + " KB/s" : "--";
        console.log(`${t.id}	${t.status.padEnd(12)}	${t.progressPercent}%		${speed.padEnd(12)}	${t.fileName}`);
      });
      break;
    }
    case "pause": {
      const id = args[1];
      if (!id) {
        console.error("Usage: lidm pause <task-id>");
        process.exit(1);
      }
      const ok = await queue.pauseDownload(id);
      console.log(ok ? `Paused ${id}` : `Task ${id} not found`);
      break;
    }
    case "resume": {
      const id = args[1];
      if (!id) {
        console.error("Usage: lidm resume <task-id>");
        process.exit(1);
      }
      const ok = await queue.resumeDownload(id);
      console.log(ok ? `Resumed ${id}` : `Task ${id} not found`);
      break;
    }
    case "delete": {
      const id = args[1];
      if (!id) {
        console.error("Usage: lidm delete <task-id> [--file]");
        process.exit(1);
      }
      const deleteFile = args.includes("--file");
      const ok = await queue.deleteDownload(id, deleteFile);
      console.log(ok ? `Deleted ${id}` : `Task ${id} not found`);
      break;
    }
    case "search": {
      const query = args[1];
      if (!query) {
        console.error("Usage: lidm search <query>");
        process.exit(1);
      }
      const searchEngine = new DownloadSearchEngine();
      const results = searchEngine.filter(queue.getTasks(), query);
      console.log(`Found ${results.length} match(es):`);
      results.forEach((r) => {
        console.log(`  [${r.index}] ${r.item.fileName} (${r.item.status}) - ${r.item.url}`);
      });
      break;
    }
    case "probe": {
      const url = args[1];
      if (!url) {
        console.error("Usage: lidm probe <url>");
        process.exit(1);
      }
      console.log(`Inspecting URL stream: ${url}...`);
      const probe = await SegmentDownloader.probeUrl(url);
      console.log(JSON.stringify(probe, null, 2));
      break;
    }
    case "help":
    case "--help":
    default: {
      console.log("Linux Internet Download Manager (LIDM) - CLI Help\n");
      console.log("Usage: lidm <command> [options]\n");
      console.log("Commands:");
      console.log("  ui [--port 3030]     Start desktop web UI dashboard (default)");
      console.log("  add <url> [options]  Add a download (options: --segments 16, --category Video)");
      console.log("  list                 List all downloads");
      console.log("  pause <id>           Pause an active download");
      console.log("  resume <id>          Resume a paused download");
      console.log("  delete <id> [--file] Delete a download (optionally delete file from disk)");
      console.log("  search <query>       Search downloads using IDM search algorithm");
      console.log("  probe <url>          Inspect remote URL stream, Range support, and file size");
      console.log("  mcp                  Start stdio Model Context Protocol (MCP) server for AI agents");
      break;
    }
  }
}

// src/main.ts
runCli(process.argv).catch((err) => {
  console.error("LIDM Error:", err.message || err);
  process.exit(1);
});
