// Tauri 后端 API 的类型化封装
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Score {
  id: string;
  title: string;
  composer: string | null;
  instrument: "piano" | "guitar" | "other";
  sourceType: "pdf" | "png" | "jpg" | "musicxml" | "gp";
  status: "imported" | "processing" | "ready" | "failed";
  originalPath: string | null;
  musicxmlPath: string | null;
  coverPath: string | null;
  pages: string[];
  /// 自定义标签
  tags: string[];
  pageCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreQuery {
  query?: string;
  instrument?: string;
  status?: string;
  tag?: string;
}

export interface Job {
  id: string;
  scoreId: string;
  kind: string;
  state: "queued" | "running" | "done" | "failed" | "canceled";
  progress: number;
  message: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface OmrProgressEvent {
  jobId: string;
  scoreId: string;
  state: string;
  progress: number;
  message: string | null;
}

export interface OmrDoneEvent {
  jobId: string;
  scoreId: string;
  ok: boolean;
  score: Score | null;
  error: string | null;
}

export interface AppInfo {
  dataDir: string;
  resourceDir: string | null;
  engineFound: boolean;
  enginePath: string | null;
  vlmConfigured: boolean;
}

export interface Setting {
  key: string;
  value: string;
}

/// 每首曲子的练习状态（跨会话恢复）
export interface PracticeState {
  speed: number;
  volume: number;
  loopEnabled: boolean;
  /// "page" | "horizontal"
  layout: string;
  scale: number;
  abStart: number | null;
  abEnd: number | null;
  metronomeEnabled: boolean;
  /// alphaTab 量程 0.0-3.0
  metronomeVolume: number;
  countInEnabled: boolean;
}

/// A-B 循环段落(命名保存,一键切换)
export interface AbSegment {
  id: string;
  scoreId: string;
  name: string;
  startTick: number;
  endTick: number;
}

/// 练习统计:每曲合计
export interface PracticeStatRow {
  scoreId: string;
  title: string;
  instrument: string;
  totalSeconds: number;
  sessions: number;
  lastPlayedAt: string;
}

/// 练习统计:按日合计
export interface DailyPractice {
  day: string;
  seconds: number;
}

/// 歌单
export interface Playlist {
  id: string;
  name: string;
  itemCount: number;
}

/// 歌单曲目
export interface PlaylistItem {
  id: string;
  position: number;
  score: Score;
}

export const api = {
  pickImportFiles: () => invoke<string[]>("pick_import_files"),
  pickImportFolder: () => invoke<string | null>("pick_import_folder"),
  listFolderScores: (folder: string) => invoke<string[]>("list_folder_scores", { folder }),
  importFiles: (paths: string[]) =>
    invoke<{ imported: Score[]; skipped: string[] }>("import_files", { paths }),
  importMerged: (paths: string[]) => invoke<Score>("import_merged", { paths }),
  importClipboardImage: () => invoke<Score | null>("import_clipboard_image"),
  listScores: (query?: ScoreQuery) =>
    invoke<Score[]>("list_scores", { query: query ?? null }),
  getScore: (id: string) => invoke<Score | null>("get_score", { id }),
  updateScore: (id: string, title: string, composer?: string, instrument?: string) =>
    invoke<Score>("update_score", { id, title, composer: composer ?? null, instrument: instrument ?? null }),
  deleteScore: (id: string) => invoke<void>("delete_score", { id }),
  openScoreAsset: (path: string) => invoke<void>("open_score_asset", { path }),
  exportPrintHtml: (scoreId: string, title: string, html: string) =>
    invoke<string>("export_print_html", { scoreId, title, html }),
  saveRecording: (scoreId: string, bytes: Uint8Array, ext: string) =>
    invoke<string>("save_recording", { scoreId, bytes: Array.from(bytes), ext }),
  listRecordings: (scoreId: string) => invoke<string[]>("list_recordings", { scoreId }),
  deleteRecording: (path: string) => invoke<void>("delete_recording", { path }),
  readScoreAsset: (path: string) => invoke<number[]>("read_score_asset", { path }),
  startRecognition: (scoreIds: string[]) =>
    invoke<Job[]>("start_recognition", { scoreIds }),
  cancelRecognition: (jobId: string) => invoke<void>("cancel_recognition", { jobId }),
  listJobs: (scoreId?: string) => invoke<Job[]>("list_jobs", { scoreId: scoreId ?? null }),
  readJobLog: (jobId: string) => invoke<string | null>("read_job_log", { jobId }),
  saveAlphaTex: (scoreId: string, content: string) =>
    invoke<Score>("save_alpha_tex", { scoreId, content }),
  pickBackupTarget: () => invoke<string | null>("pick_backup_target"),
  pickBackupSource: () => invoke<string | null>("pick_backup_source"),
  exportBackup: (target: string) => invoke<void>("export_backup", { target }),
  importBackup: (source: string) => invoke<number>("import_backup", { source }),
  getSettings: () => invoke<Setting[]>("get_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),
  getPracticeState: (scoreId: string) =>
    invoke<PracticeState | null>("get_practice_state", { scoreId }),
  setPracticeState: (scoreId: string, practice: PracticeState) =>
    invoke<void>("set_practice_state", { scoreId, practice }),
  testVlmConnection: (apiBase: string, apiKey: string, model: string) =>
    invoke<string>("test_vlm_connection", { apiBase, apiKey, model }),
  fetchVlmModels: (apiBase: string, apiKey: string) =>
    invoke<string[]>("fetch_vlm_models", { apiBase, apiKey }),
  list_playlist_items: (playlistId: string) =>
    invoke<PlaylistItem[]>("list_playlist_items", { playlistId }),
  add_to_playlist: (playlistId: string, scoreId: string) =>
    invoke<void>("add_to_playlist", { playlistId, scoreId }),
  remove_from_playlist: (itemId: string) => invoke<void>("remove_from_playlist", { itemId }),
  create_playlist: (name: string) => invoke<Playlist>("create_playlist", { name }),
  delete_playlist: (id: string) => invoke<void>("delete_playlist", { id }),
  list_playlists: () => invoke<Playlist[]>("list_playlists"),
  set_score_tags: (id: string, tags: string[]) => invoke<void>("set_score_tags", { id, tags }),
  list_ab_segments: (scoreId: string) => invoke<AbSegment[]>("list_ab_segments", { scoreId }),
  save_ab_segment: (scoreId: string, name: string, startTick: number, endTick: number) =>
    invoke<AbSegment>("save_ab_segment", { scoreId, name, startTick, endTick }),
  delete_ab_segment: (id: string) => invoke<void>("delete_ab_segment", { id }),
  add_practice_time: (scoreId: string, seconds: number) =>
    invoke<void>("add_practice_time", { scoreId, seconds }),
  list_practice_stats: () => invoke<PracticeStatRow[]>("list_practice_stats"),
  practice_daily: (days: number) => invoke<DailyPractice[]>("practice_daily", { days }),
  pickSavePath: (fileName: string, ext: string) =>
    invoke<string | null>("pick_save_path", { fileName, ext }),
  writeExportBytes: (path: string, bytes: Uint8Array) =>
    invoke<void>("write_export_bytes", { path, bytes: Array.from(bytes) }),
  exportScoreSource: (id: string, target: string) =>
    invoke<void>("export_score_source", { id, target }),
};

export const events = {
  onOmrProgress: (cb: (e: OmrProgressEvent) => void): Promise<UnlistenFn> =>
    listen<OmrProgressEvent>("omr://progress", (ev) => cb(ev.payload)),
  onOmrDone: (cb: (e: OmrDoneEvent) => void): Promise<UnlistenFn> =>
    listen<OmrDoneEvent>("omr://done", (ev) => cb(ev.payload)),
};

/// 把曲库内文件读成 Uint8Array（alphaTab 加载用）
export async function readAssetBytes(path: string): Promise<Uint8Array> {
  const bytes = await api.readScoreAsset(path);
  return new Uint8Array(bytes);
}

/// 把曲库内文件读成 Blob（封面/原图显示用）
export async function readAssetBlob(path: string, mime = "image/png"): Promise<Blob> {
  const bytes = await readAssetBytes(path);
  return new Blob([bytes as unknown as BlobPart], { type: mime });
}
