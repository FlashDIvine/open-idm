import type { DownloadTask, SearchResult, SearchSettings } from "../types.ts";

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  searchFileName: true,
  searchDescription: false,
  searchSiteOrUrlOrReferer: false,
  matchCase: false,
  matchWholeString: false,
};

export function extractHostname(url: string): string {
  const schemeIndex = url.indexOf("://");
  const sub = schemeIndex !== -1 ? url.slice(schemeIndex + 3) : url;
  const slashIndex = sub.indexOf("/");
  const hostAndPort = slashIndex !== -1 ? sub.slice(0, slashIndex) : sub;
  const colonIndex = hostAndPort.indexOf(":");
  return colonIndex !== -1 ? hostAndPort.slice(0, colonIndex) : hostAndPort;
}

function matchText(
  text: string | undefined,
  query: string,
  matchCase: boolean,
  matchWholeString: boolean
): boolean {
  if (!text || !query) return false;
  const target = matchCase ? text : text.toLowerCase();
  const pattern = matchCase ? query : query.toLowerCase();

  return matchWholeString ? target === pattern : target.includes(pattern);
}

function matchUrl(
  url: string | undefined,
  query: string,
  matchCase: boolean,
  matchWholeString: boolean
): boolean {
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

export function matchTask(
  task: DownloadTask,
  query: string,
  settings: SearchSettings = DEFAULT_SEARCH_SETTINGS
): boolean {
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

export class DownloadSearchEngine {
  private cursorIndex = 0;
  private lastQuery = "";

  public filter(
    tasks: DownloadTask[],
    query: string,
    settings: SearchSettings = DEFAULT_SEARCH_SETTINGS
  ): SearchResult[] {
    const q = query.trim();
    if (!q) {
      return tasks.map((task, index) => ({ matched: true, item: task, index }));
    }

    const results: SearchResult[] = [];
    tasks.forEach((task, index) => {
      if (matchTask(task, q, settings)) {
        results.push({ matched: true, item: task, index });
      }
    });
    return results;
  }

  public findNext(
    tasks: DownloadTask[],
    query: string,
    settings: SearchSettings = DEFAULT_SEARCH_SETTINGS
  ): { found: boolean; index: number; item?: DownloadTask; wrappedAround: boolean } {
    const q = query.trim();
    if (!q || tasks.length === 0) return { found: false, index: -1, wrappedAround: false };

    if (q !== this.lastQuery) {
      this.lastQuery = q;
      this.cursorIndex = 0;
    }

    const total = tasks.length;
    const start = this.cursorIndex % total;

    // Scan forward
    for (let i = start; i < total; i++) {
      if (matchTask(tasks[i], q, settings)) {
        this.cursorIndex = (i + 1) % total;
        return { found: true, index: i, item: tasks[i], wrappedAround: false };
      }
    }

    // Wrap around
    for (let i = 0; i < start; i++) {
      if (matchTask(tasks[i], q, settings)) {
        this.cursorIndex = (i + 1) % total;
        return { found: true, index: i, item: tasks[i], wrappedAround: true };
      }
    }

    return { found: false, index: -1, wrappedAround: false };
  }

  public resetCursor(): void {
    this.cursorIndex = 0;
  }
}
