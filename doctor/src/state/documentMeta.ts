export interface DocumentMeta {
  fileName: string;
  fileSize: number;
  uploadedAt: string;
}

const STORAGE_KEY = "aurlum_doc_meta";

function loadAll(): Record<string, DocumentMeta> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, DocumentMeta>;
  } catch {
    return {};
  }
}

export function saveDocumentMeta(sessionId: string, meta: DocumentMeta): void {
  const all = loadAll();
  all[sessionId] = meta;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getDocumentMeta(sessionId: string): DocumentMeta | undefined {
  return loadAll()[sessionId];
}
