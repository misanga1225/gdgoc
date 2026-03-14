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
