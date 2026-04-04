export interface UpdateInfo {
  version: string;
  releaseNotes: string | null;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export type UpdateStatus =
  | { state: "checking" }
  | { state: "available"; info: UpdateInfo }
  | { state: "not-available" }
  | { state: "downloading"; progress: UpdateProgress }
  | { state: "downloaded"; info: UpdateInfo }
  | { state: "error"; message: string };
