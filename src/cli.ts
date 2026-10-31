import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { QueueManager, DEFAULT_CONFIG } from "./engine/queueManager.ts";
import { WebServer } from "./server/webServer.ts";
import { LidmMcpServer } from "./mcp/lidmMcpServer.ts";
import { SegmentDownloader } from "./engine/segmentDownloader.ts";
import { DownloadSearchEngine } from "./search/searchEngine.ts";
import type { DownloadCategory } from "./types.ts";

export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/tasks`, () => {
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

export function openAppWindow(url: string): void {
  const isWindows = process.platform === "win32";

  // Windows Standalone App Launcher
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Public";
    const progFiles = process.env["ProgramFiles"] || "C:\\Program Files";
    const progFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const appData = process.env.APPDATA || localAppData;
    const edgeProfile = path.join(appData, "LIDM", "edge-profile");

    const winCandidates = [
      path.join(progFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(progFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(progFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(progFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      "msedge.exe",
      "chrome.exe",
    ];

    for (const exe of winCandidates) {
      if (fs.existsSync(exe) || !exe.includes("\\")) {
        try {
          const child = spawn(exe, [`--app=${url}`, `--user-data-dir=${edgeProfile}`, "--class=lidm"], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });
          child.unref();
          return;
        } catch {
          // continue
        }
      }
    }

    // Fallback: Windows default start command
    try {
      const child = spawn("cmd.exe", ["/c", "start", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    } catch {}
    return;
  }

  // Linux Standalone App Launcher
  const isGui = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  if (!isGui) return;

  // Check native GTK3+WebKit2 lidm-app.py first
  const execDir = path.dirname(process.execPath);
  const possiblePyApps = [
    path.join(execDir, "bin", "lidm-app.py"),
    path.join(execDir, "lidm-app.py"),
    "/home/najib/Dokumen/REA/lidm/bin/lidm-app.py",
  ];
  for (const pyApp of possiblePyApps) {
    if (fs.existsSync(pyApp)) {
      try {
        const child = spawn("python3", [pyApp, url], {
          detached: true,
          stdio: "ignore",
          env: process.env,
        });
        child.unref();
        return;
      } catch {}
    }
  }

  const candidates = [
    { cmd: "brave-browser", args: [`--app=${url}`, `--user-data-dir=${path.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "google-chrome", args: [`--app=${url}`, `--user-data-dir=${path.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "google-chrome-stable", args: [`--app=${url}`, `--user-data-dir=${path.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "chromium", args: [`--app=${url}`, `--user-data-dir=${path.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "chromium-browser", args: [`--app=${url}`, `--user-data-dir=${path.join(process.env.HOME || "", ".lidm", "browser-profile")}`, "--class=lidm"] },
    { cmd: "xdg-open", args: [url] },
    { cmd: "firefox", args: [url] },
  ];

  const envPath = process.env.PATH || "/usr/bin:/bin:/usr/local/bin";
  const dirs = envPath.split(":");

  for (const { cmd, args } of candidates) {
    for (const dir of dirs) {
      const fullPath = path.join(dir, cmd);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const child = spawn(fullPath, args, {
            detached: true,
            stdio: "ignore",
            env: process.env,
          });
          child.unref();
          return;
        }
      } catch {
        // continue
      }
    }
  }
}

export async function runCli(argv: string[]): Promise<void> {
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

      if (!(await isPortInUse(port))) {
        console.log(`[!] LIDM is not running on port ${port}.`);
        return;
      }

      const req = http.request({
        hostname: "localhost",
        port,
        path: "/api/shutdown",
        method: "POST",
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
      const category = catIdx !== -1 ? (args[catIdx + 1] as DownloadCategory) : undefined;

      console.log(`Probing URL: ${url}...`);
      const task = await queue.addDownload(url, {
        segmentCount: segments,
        category,
        startImmediately: true,
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
      console.log("ID\t\tStatus\t\tProgress\tSpeed\t\tFile Name");
      console.log("-------------------------------------------------------------------------");
      tasks.forEach((t) => {
        const speed = t.speed > 0 ? (t.speed / 1024).toFixed(1) + " KB/s" : "--";
        console.log(`${t.id}\t${t.status.padEnd(12)}\t${t.progressPercent}%\t\t${speed.padEnd(12)}\t${t.fileName}`);
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
