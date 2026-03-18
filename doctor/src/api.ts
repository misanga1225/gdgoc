import { auth } from "./firebase";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8081";

/** Firebase Auth トークンを含む共通ヘッダーを返す */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  // 開発環境ではトークンなしで通す（バックエンド側も開発時は認証スキップ）
  if (!user) return { "Content-Type": "application/json" };
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/** セッション作成 */
export async function createSession(name: string, patientId: string) {
  const resp = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: await getAuthHeaders(),
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
    headers: await getAuthHeaders(),
    body: JSON.stringify({ session_id: sessionId, html }),
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json() as Promise<{ document_url: string }>;
}

/** 見落とし要約取得 */
export async function summarizeMissed(
  sessionId: string,
  missedParagraphs: { id: string; text: string; dwell_time: number }[]
) {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}/summarize-missed`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({ paragraphs: missedParagraphs }),
  });
  if (!resp.ok) throw new Error((await resp.json()).error);
  return resp.json() as Promise<{ summary: string }>;
}
