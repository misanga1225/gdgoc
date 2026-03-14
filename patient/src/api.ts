const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

/** セッション情報を取得 */
export async function getSession(sessionId: string): Promise<{
  session_id: string;
  name: string;
  status: string;
  document_url: string;
}> {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}`);
  if (!resp.ok) {
    throw new Error(`Session not found: ${resp.status}`);
  }
  return resp.json();
}

/** セッションのステータスを更新 */
export async function updateSessionStatus(
  sessionId: string,
  status: string
): Promise<void> {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error ?? `Status update failed: ${resp.status}`);
  }
}

/** 最終同意 — ハッシュチェーン計算 + KMS署名 + Evidence保存 */
export async function finalizeSession(sessionId: string): Promise<{
  evidence_id: string;
  root_hash: string;
  timestamp: string;
}> {
  const resp = await fetch(`${API_BASE}/sessions/${sessionId}/finalize`, {
    method: "POST",
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error ?? `Finalize failed: ${resp.status}`);
  }
  return resp.json();
}
