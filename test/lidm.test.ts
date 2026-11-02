import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fsp from "node:fs/promises";
import { CategoryManager } from "../src/categories/categoryManager.ts";
import { DownloadSearchEngine } from "../src/search/searchEngine.ts";
import { QueueManager } from "../src/engine/queueManager.ts";
import { StreamDownloader } from "../src/engine/streamDownloader.ts";
import type { DownloadTask } from "../src/types.ts";

test("CategoryManager: accurately categorizes file types", () => {
  const cm = new CategoryManager("/tmp/Downloads");
  assert.equal(cm.detectCategory("video.mp4"), "Video");
  assert.equal(cm.detectCategory("movie.mkv"), "Video");
  assert.equal(cm.detectCategory("archive.tar.gz"), "Compressed");
  assert.equal(cm.detectCategory("archive.zip"), "Compressed");
  assert.equal(cm.detectCategory("document.pdf"), "Documents");
  assert.equal(cm.detectCategory("song.flac"), "Music");
  assert.equal(cm.detectCategory("app.deb"), "Programs");
  assert.equal(cm.detectCategory("installer.exe"), "Programs");
});

test("SearchEngine: IDM reverse-engineered search rules", () => {
  const engine = new DownloadSearchEngine();
  const sampleTasks: DownloadTask[] = [
    {
      id: "1",
      fileName: "ubuntu-24.04-desktop-amd64.iso",
      url: "https://releases.ubuntu.com/24.04/ubuntu.iso",
      savePath: "/tmp/ubuntu.iso",
      fileSize: 6000000000,
      downloadedBytes: 0,
      progressPercent: 0,
      status: "completed",
      category: "Compressed",
      speed: 0,
      eta: 0,
      segmentCount: 8,
      segments: [],
      supportsRange: true,
      description: "Ubuntu Linux ISO",
      siteName: "releases.ubuntu.com",
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: "2",
      fileName: "Node-v24.19.0.tar.gz",
      url: "https://nodejs.org/dist/v24.19.0/node.tar.gz",
      savePath: "/tmp/node.tar.gz",
      fileSize: 45000000,
      downloadedBytes: 0,
      progressPercent: 0,
      status: "downloading",
      category: "Compressed",
      speed: 1024000,
      eta: 40,
      segmentCount: 8,
      segments: [],
      supportsRange: true,
      description: "Node.js JavaScript runtime",
      siteName: "nodejs.org",
      createdAt: 2000,
      updatedAt: 2000,
    },
  ];

  // Substring match
  const subMatches = engine.filter(sampleTasks, "ubuntu");
  assert.equal(subMatches.length, 1);
  assert.equal(subMatches[0].item.fileName, "ubuntu-24.04-desktop-amd64.iso");

  // Hostname isolation match with whole string
  const hostMatches = engine.filter(sampleTasks, "nodejs.org", {
    searchFileName: false,
    searchDescription: false,
    searchSiteOrUrlOrReferer: true,
    matchCase: false,
    matchWholeString: true,
  });
  assert.equal(hostMatches.length, 1);
  assert.equal(hostMatches[0].item.fileName, "Node-v24.19.0.tar.gz");

  // Find next on task index 0
  const r1 = engine.findNext(sampleTasks, "ubuntu");
  assert.equal(r1.found, true);
  assert.equal(r1.index, 0);

  // Second find next wraps around to 0
  const r2 = engine.findNext(sampleTasks, "ubuntu");
  assert.equal(r2.found, true);
  assert.equal(r2.index, 0);
  assert.equal(r2.wrappedAround, true);
});

test("QueueManager: task lifecycle (add, pause, resume, delete)", async () => {
  const testDir = path.join(os.tmpdir(), "lidm_test_" + Date.now());
  await fsp.mkdir(testDir, { recursive: true });

  const qm = new QueueManager(
    {
      defaultDownloadDir: testDir,
      defaultSegments: 4,
      maxConcurrentDownloads: 2,
      speedLimit: 0,
      clipboardMonitoring: false,
      port: 3030,
    },
    testDir
  );

  // Stop queue so it doesn't initiate real network connections during unit test
  qm.stopQueue();
  await qm.init();

  const dummyTask: DownloadTask = {
    id: "test_1",
    fileName: "sample.zip",
    url: "https://example.com/sample.zip",
    savePath: path.join(testDir, "sample.zip"),
    fileSize: 1000,
    downloadedBytes: 0,
    progressPercent: 0,
    status: "queued",
    category: "Compressed",
    speed: 0,
    eta: 0,
    segmentCount: 4,
    segments: [],
    supportsRange: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  (qm as any).tasks.set("test_1", dummyTask);
  await (qm as any).saveState();

  const retrieved = qm.getTask("test_1");
  assert.ok(retrieved);
  assert.equal(retrieved.fileName, "sample.zip");

  // Pause
  const paused = await qm.pauseDownload("test_1");
  assert.equal(paused, true);
  assert.equal(qm.getTask("test_1")?.status, "paused");

  // Resume
  const resumed = await qm.resumeDownload("test_1");
  assert.equal(resumed, true);
  assert.equal(qm.getTask("test_1")?.status, "queued");

  // Delete
  const deleted = await qm.deleteDownload("test_1");
  assert.equal(deleted, true);
  assert.equal(qm.getTask("test_1"), undefined);

  // Clean up
  await fsp.rm(testDir, { recursive: true, force: true });
});

test("StreamDownloader: recognizes streaming service domains", () => {
  assert.equal(StreamDownloader.isStreamUrl("https://www.youtube.com/watch?v=fnquM8GEkvA"), true);
  assert.equal(StreamDownloader.isStreamUrl("https://youtu.be/fnquM8GEkvA"), true);
  assert.equal(StreamDownloader.isStreamUrl("https://www.tiktok.com/@user/video/1234567890"), true);
  assert.equal(StreamDownloader.isStreamUrl("https://www.instagram.com/reel/C8abcde/"), true);
  assert.equal(StreamDownloader.isStreamUrl("https://twitter.com/user/status/123456"), true);
  assert.equal(StreamDownloader.isStreamUrl("https://x.com/user/status/123456"), true);
  assert.equal(StreamDownloader.isStreamUrl("https://fb.watch/xyz/"), true);

  // Direct file URLs should not be marked as streaming domains
  assert.equal(StreamDownloader.isStreamUrl("https://releases.ubuntu.com/24.04/ubuntu.iso"), false);
  assert.equal(StreamDownloader.isStreamUrl("https://nodejs.org/dist/v20.0.0/node.tar.gz"), false);
});

test("StreamDownloader: correctly distinguishes video vs audio stream formats", () => {
  const isAudioFormat = (formatId: string, mediaType?: string) => {
    return mediaType === "audio_stream" || (
      mediaType !== "video_stream" &&
      !formatId.includes("bestvideo") &&
      Boolean(formatId.startsWith("bestaudio") || formatId.startsWith("ba"))
    );
  };

  // Video formats containing +bestaudio must NOT be classified as audio only
  assert.equal(isAudioFormat("bestvideo+bestaudio/best"), false);
  assert.equal(isAudioFormat("bestvideo[height<=1080]+bestaudio/best[height<=1080]"), false);
  assert.equal(isAudioFormat("bestvideo[height<=720]+bestaudio/best[height<=720]"), false);
  assert.equal(isAudioFormat("bestvideo[height<=480]+bestaudio/best[height<=480]"), false);
  assert.equal(isAudioFormat("bestvideo+bestaudio/best", "video_stream"), false);

  // Pure audio formats MUST be classified as audio only
  assert.equal(isAudioFormat("bestaudio/best"), true);
  assert.equal(isAudioFormat("bestaudio"), true);
  assert.equal(isAudioFormat("ba/b"), true);
  assert.equal(isAudioFormat("anything", "audio_stream"), true);
});
