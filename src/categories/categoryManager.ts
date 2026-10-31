import path from "node:path";
import os from "node:os";
import type { DownloadCategory } from "../types.ts";

const CATEGORY_EXTENSIONS: Record<Exclude<DownloadCategory, "All">, string[]> = {
  Compressed: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "zst", "tgz", "iso"],
  Documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "epub", "odt", "ods", "odp", "rtf", "md"],
  Music: ["mp3", "flac", "wav", "aac", "ogg", "m4a", "wma", "opus", "alac"],
  Programs: ["deb", "rpm", "appimage", "sh", "bin", "exe", "apk", "flatpakref", "msi"],
  Video: ["mp4", "mkv", "webm", "avi", "mov", "flv", "wmv", "m4v", "ts", "3gp"],
};

export class CategoryManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.homedir(), "Downloads");
  }

  public detectCategory(fileName: string): DownloadCategory {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!ext) return "Documents";

    for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS)) {
      if (extensions.includes(ext)) {
        return category as DownloadCategory;
      }
    }

    return "Documents";
  }

  public getCategoryDirectory(category: DownloadCategory): string {
    if (category === "All") {
      return this.baseDir;
    }
    return path.join(this.baseDir, category);
  }

  public getDefaultCategories(): DownloadCategory[] {
    return ["All", "Compressed", "Documents", "Music", "Programs", "Video"];
  }
}
