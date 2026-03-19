import { getDocumentMeta } from "./documentMeta";

export interface SessionFileItem {
  id: string;
  /** このファイルが属するセッションID */
  sessionId: string;
  name: string;
  updatedAt: string;
  kind: string;
  size: string;
  sourceUrl?: string;
}

const sessionFilesMap = new Map<string, SessionFileItem[]>();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** D02再描画時にキャッシュをクリアし、最新データを反映させる */
export function clearSessionFilesCache(): void {
  sessionFilesMap.clear();
}

export function ensureSessionFiles(
  sessionId: string,
  sourceUrl?: string
): SessionFileItem[] {
  const existing = sessionFilesMap.get(sessionId);
  if (existing) {
    return existing;
  }

  if (!sourceUrl) {
    sessionFilesMap.set(sessionId, []);
    return [];
  }

  const meta = getDocumentMeta(sessionId);
  const file: SessionFileItem = meta
    ? {
        id: `${sessionId}-file-1`,
        sessionId,
        name: meta.fileName.replace(/\.docx$/i, ""),
        updatedAt: formatTimestamp(meta.uploadedAt),
        kind: "HTMLファイル",
        size: formatBytes(meta.fileSize),
        sourceUrl,
      }
    : {
        id: `${sessionId}-file-1`,
        sessionId,
        name: "同意書",
        updatedAt: "-",
        kind: "HTMLファイル",
        size: "-",
        sourceUrl,
      };

  const files = [file];
  sessionFilesMap.set(sessionId, files);
  return files;
}

/** グループ（複数セッション）の全ファイルを結合して返す */
export function ensureGroupFiles(
  sessions: { sessionId: string; sourceUrl?: string }[]
): SessionFileItem[] {
  const allFiles: SessionFileItem[] = [];
  for (const s of sessions) {
    allFiles.push(...ensureSessionFiles(s.sessionId, s.sourceUrl));
  }
  return allFiles;
}

export function deleteSessionFile(sessionId: string, fileId: string): void {
  const files = sessionFilesMap.get(sessionId);
  if (!files) {
    return;
  }

  const next = files.filter((file) => file.id !== fileId);
  sessionFilesMap.set(sessionId, next);
}
