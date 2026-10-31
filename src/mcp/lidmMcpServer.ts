import { QueueManager } from "../engine/queueManager.ts";
import { DownloadSearchEngine, DEFAULT_SEARCH_SETTINGS } from "../search/searchEngine.ts";
import { SegmentDownloader } from "../engine/segmentDownloader.ts";
import type { DownloadCategory, SearchSettings } from "../types.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Standard Model Context Protocol (MCP) Server for LIDM
 * Allows AI Agents (Gemini CLI, Claude Code, Cursor, Codex) to control downloads
 * and analyze binaries using REA.
 */
export class LidmMcpServer {
  private searchEngine = new DownloadSearchEngine();
  private queue: QueueManager;

  constructor(queue: QueueManager) {
    this.queue = queue;
  }

  public async startStdio(): Promise<void> {
    await this.queue.init();

    process.stdin.setEncoding("utf-8");
    let buffer = "";

    process.stdin.on("data", async (chunk: string) => {
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
        } catch (err: any) {
          const errorRes = {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error: " + err.message },
          };
          process.stdout.write(JSON.stringify(errorRes) + "\n");
        }
      }
    });
  }

  private async handleRpc(req: any): Promise<any> {
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
              version: "1.0.0",
            },
            capabilities: {
              tools: {},
            },
          },
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
                      description: "Download category",
                    },
                    segmentCount: {
                      type: "number",
                      description: "Number of concurrent segments (1-32, default: 8)",
                    },
                    description: { type: "string", description: "Optional description of download" },
                  },
                  required: ["url"],
                },
              },
              {
                name: "lidm_list_downloads",
                description: "List all active, queued, paused, and completed downloads",
                inputSchema: {
                  type: "object",
                  properties: {
                    category: { type: "string", description: "Optional category filter" },
                  },
                },
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
                    matchWholeString: { type: "boolean", description: "Match whole string only" },
                  },
                  required: ["query"],
                },
              },
              {
                name: "lidm_control_download",
                description: "Pause, resume, or delete a download task by ID",
                inputSchema: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Task ID" },
                    action: { type: "string", enum: ["pause", "resume", "delete"], description: "Control action" },
                    deleteFile: { type: "boolean", description: "Whether to delete the downloaded file from disk" },
                  },
                  required: ["id", "action"],
                },
              },
              {
                name: "lidm_probe_url",
                description: "Probe remote URL headers, check Range support, file size, and direct stream links",
                inputSchema: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "URL to probe" },
                  },
                  required: ["url"],
                },
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
                      description: "Inspection operation",
                    },
                  },
                  required: ["path"],
                },
              },
            ],
          },
        };

      case "tools/call": {
        const toolName = params?.name;
        const args = params?.arguments || {};

        try {
          let outputContent: string = "";

          if (toolName === "lidm_add_download") {
            const task = await this.queue.addDownload(args.url, {
              fileName: args.fileName,
              category: args.category as DownloadCategory,
              segmentCount: args.segmentCount,
              description: args.description,
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
            const settings: SearchSettings = {
              searchFileName: args.searchFileName ?? true,
              searchDescription: args.searchDescription ?? false,
              searchSiteOrUrlOrReferer: args.searchSiteOrUrlOrReferer ?? false,
              matchCase: args.matchCase ?? false,
              matchWholeString: args.matchWholeString ?? false,
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
              content: [{ type: "text", text: outputContent }],
            },
          };
        } catch (err: any) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: "Error: " + (err.message || String(err)) }],
              isError: true,
            },
          };
        }
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }
}
