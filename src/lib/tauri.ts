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
  pageCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreQuery {
  query?: string;
  instrument?: string;
  status?: string;
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

export const api = {
  pickImportFiles: () => invoke<string[]>("pick_import_files"),
  pickImportFolder: () => invoke<string | null>("pick_import_folder"),
  listFolderScores: (folder: string) => invoke<string[]>("list_folder_scores", { folder }),
  importFiles: (paths: string[]) =>
    invoke<{ imported: Score[]; skipped: string[] }>("import_files", { paths }),
  importMerged: (paths: string[]) => invoke<Score>("import_merged", { paths }),
  listScores: (query?: ScoreQuery) =>
    invoke<Score[]>("list_scores", { query: query ?? null }),
  getScore: (id: string) => invoke<Score | null>("get_score", { id }),
  updateScore: (id: string, title: string, composer?: string, instrument?: string) =>
    invoke<Score>("update_score", { id, title, composer: composer ?? null, instrument: instrument ?? null }),
  deleteScore: (id: string) => invoke<void>("delete_score", { id }),
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
  testVlmConnection: (apiBase: string, apiKey: string, model: string) =>
    invoke<string>("test_vlm_connection", { apiBase, apiKey, model }),
  fetchVlmModels: (apiBase: string, apiKey: string) =>
    invoke<string[]>("fetch_vlm_models", { apiBase, apiKey }),
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
