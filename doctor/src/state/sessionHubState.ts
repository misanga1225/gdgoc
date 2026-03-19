import { getDocumentMeta } from "./documentMeta";

export interface SessionFileItem {
  id: string;
  sessionId: string;
  name: string;
  updatedAt: string;
  kind: string;
  size: string;
  sourceUrl?: string;
}

const sessionFilesMap = new Map<string, SessionFileItem[]>();

/* ── デモ用モックファイル（ハッカソン向け） ── */
const DEMO_SESSION_ID = "demo-saito-base";

const DEMO_MOCK_FILES: SessionFileItem[] = [
  {
    id: "demo-saito-excel",
    sessionId: DEMO_SESSION_ID,
    name: "入院診療計画書",
    updatedAt: "2026/03/15 09:32",
    kind: "Excelファイル",
    size: "245KB",
  },
  {
    id: "demo-saito-pdf",
    sessionId: DEMO_SESSION_ID,
    name: "退院療養計画書",
    updatedAt: "2026/03/17 14:08",
    kind: "PDFファイル",
    size: "1.8MB",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function resolveDisplayKind(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return "Wordファイル";
  }
  if (lower.endsWith(".pdf")) {
    return "PDFファイル";
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return "Excelファイル";
  }
  return "ファイル";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

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

  if (sessionId === DEMO_SESSION_ID) {
    sessionFilesMap.set(sessionId, [...DEMO_MOCK_FILES]);
    return sessionFilesMap.get(sessionId)!;
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
        name: stripExtension(meta.fileName || "資料"),
        updatedAt: formatTimestamp(meta.uploadedAt),
        kind: resolveDisplayKind(meta.fileName || ""),
        size: formatBytes(meta.fileSize),
        sourceUrl,
      }
    : {
        id: `${sessionId}-file-1`,
        sessionId,
        name: "同意書",
        updatedAt: "-",
        kind: "ファイル",
        size: "-",
        sourceUrl,
      };

  const files = [file];
  sessionFilesMap.set(sessionId, files);
  return files;
}

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
