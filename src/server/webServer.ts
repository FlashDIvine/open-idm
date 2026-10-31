import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QueueManager } from "../engine/queueManager.ts";
import { DownloadSearchEngine } from "../search/searchEngine.ts";
import { SegmentDownloader } from "../engine/segmentDownloader.ts";
import type { DownloadCategory, SearchSettings } from "../types.ts";

function getPublicDir(): string {
  // 1. Next to packaged executable (Windows .exe or Linux standalone binary)
  const execDir = path.dirname(process.execPath);
  const candidateExec = path.join(execDir, "public");
  if (fs.existsSync(candidateExec)) return candidateExec;

  // 2. Relative to current script directory (ESM or CJS)
  try {
    const currentDir = typeof __dirname !== "undefined"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
    const candidate1 = path.resolve(currentDir, "../public");
    if (fs.existsSync(candidate1)) return candidate1;
    const candidate2 = path.resolve(currentDir, "../../public");
    if (fs.existsSync(candidate2)) return candidate2;
  } catch {}

  // 3. Fallback to process.cwd() or known locations
  const candidateCwd = path.resolve(process.cwd(), "public");
  if (fs.existsSync(candidateCwd)) return candidateCwd;

  return candidateCwd;
}

const PUBLIC_DIR = getPublicDir();

export class WebServer {
  private server: http.Server | null = null;
  private sseClients: Set<http.ServerResponse> = new Set();
  private searchEngine = new DownloadSearchEngine();

  private queue: QueueManager;
  private port: number;

  constructor(queue: QueueManager, port: number = 3030) {
    this.queue = queue;
    this.port = port;
  }

  public async start(): Promise<void> {
    await this.queue.init();

    // Listen to queue events and broadcast to SSE clients
    const broadcast = () => {
      if (this.sseClients.size === 0) return;
      const data = JSON.stringify(this.queue.getTasks());
      for (const client of this.sseClients) {
        client.write(`data: ${data}\n\n`);
      }
    };

    this.queue.on("taskProgress", broadcast);
    this.queue.on("taskSpeed", broadcast);
    this.queue.on("taskAdded", broadcast);
    this.queue.on("taskUpdated", broadcast);
    this.queue.on("taskCompleted", broadcast);
    this.queue.on("taskError", broadcast);
    this.queue.on("taskDeleted", broadcast);

    this.server = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = parsedUrl.pathname;

      // Enable CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // API Endpoints
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
            category: body.category as DownloadCategory,
            segmentCount: body.segmentCount ? parseInt(body.segmentCount, 10) : undefined,
            description: body.description,
            startImmediately: body.startImmediately ?? true,
          });
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify(task));
        } catch (err: any) {
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
        } catch (err: any) {
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
        const settings: SearchSettings = body.settings;
        const results = this.searchEngine.filter(tasks, body.query || "", settings);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
        return;
      }

      // Server-Sent Events (SSE) for Real-Time UI Updates
      if (pathname === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        this.sseClients.add(res);
        res.write(`data: ${JSON.stringify(this.queue.getTasks())}\n\n`);

        req.on("close", () => {
          this.sseClients.delete(res);
        });
        return;
      }

      // Serve Static Files
      let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(PUBLIC_DIR, "index.html");
      }

      try {
        const content = await fsp.readFile(filePath);
        const ext = path.extname(filePath);
        const mimeTypes: Record<string, string> = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".ico": "image/x-icon",
        };
        res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(this.port, () => {
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private readJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
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
}
