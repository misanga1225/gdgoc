const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

/** セッション作成 */
export async function createSession(name: string, patientId: string) {
  const resp = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, patient_id: patientId }),
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json() as Promise<{ session_id: string; patient_url: string }>;
}

/** セッション取得 */
export async function getSession(sessionId: string) {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json() as Promise<Record<string, unknown>>;
}

/** ステータス更新 */
export async function updateSessionStatus(sessionId: string, status: string) {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json();
}

/** 文書アップロード */
export async function uploadDocument(sessionId: string, html: string) {
  const resp = await fetch(`${API_BASE}/documents/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, html }),
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json() as Promise<{ document_url: string }>;
}

/** 見落とし要約取得 */
export async function summarizeMissed(
  sessionId: string,
  missedParagraphs: { id: string; text: string }[]
) {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}/summarize-missed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paragraphs: missedParagraphs }),
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json() as Promise<{ summary: string }>;
}
