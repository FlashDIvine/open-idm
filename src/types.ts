export type DownloadStatus =
  | "queued"
  | "connecting"
  | "downloading"
  | "paused"
  | "completed"
  | "error";

export type DownloadCategory =
  | "All"
  | "Compressed"
  | "Documents"
  | "Music"
  | "Programs"
  | "Video";

export interface SegmentInfo {
  index: number;
  start: number;
  end: number;
  current: number;
  downloaded: number;
  status: "idle" | "downloading" | "completed" | "error";
  speed: number;
}

export interface StreamFormatOption {
  formatId: string;
  qualityLabel: string;
  ext: string;
  filesize?: number;
  isAudioOnly?: boolean;
}

export interface StreamProbeResult {
  url: string;
  title: string;
  fileName: string;
  duration: number;
  thumbnailUrl?: string;
  formats: StreamFormatOption[];
  defaultFormat: string;
  category: DownloadCategory;
}

export interface DownloadTask {
  id: string;
  url: string;
  fileName: string;
  savePath: string;
  fileSize: number;
  downloadedBytes: number;
  progressPercent: number;
  status: DownloadStatus;
  category: DownloadCategory;
  speed: number; // bytes/sec
  eta: number; // seconds
  segmentCount: number;
  segments: SegmentInfo[];
  supportsRange: boolean;
  etag?: string;
  description?: string;
  referer?: string;
  siteName?: string;
  mediaType?: "file" | "video_stream" | "audio_stream";
  thumbnailUrl?: string;
  duration?: number;
  qualityLabel?: string;
  formatId?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface SearchSettings {
  searchFileName: boolean;
  searchDescription: boolean;
  searchSiteOrUrlOrReferer: boolean;
  matchCase: boolean;
  matchWholeString: boolean;
}

export interface SearchResult {
  matched: boolean;
  item: DownloadTask;
  index: number;
}

export interface AppConfig {
  defaultDownloadDir: string;
  defaultSegments: number; // 1-32, default 8
  maxConcurrentDownloads: number; // default 3
  speedLimit: number; // 0 = unlimited
  clipboardMonitoring: boolean;
  port: number;
}
