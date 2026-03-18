import { getSession } from "./api";
import type { ParagraphGaze } from "./gaze";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8081";

/**
 * 視線データをバックエンドAPI経由でFirestoreに同期する。
 * 以前はFirestore SDKで直接書き込んでいたが、
 * ブラウザ環境でのCORS/接続問題を回避するためAPI経由に変更。
 */
export async function syncGazeData(
  sessionId: string,
  gazeData: ParagraphGaze[]
): Promise<void> {
  const body = {
    paragraphs: gazeData.map((gaze) => ({
      paragraph_id: gaze.paragraphId,
      dwell_time: gaze.dwellTime,
      is_reached: gaze.isReached,
    })),
  };

  const resp = await fetch(`${API_BASE}/sessions/${sessionId}/gaze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(err.error ?? `Gaze sync failed: ${resp.status}`);
  }
}

/**
 * セッションのステータス変化を監視する。
 * バックエンドAPIをポーリングして変化を検知する。
 */
export function watchSessionStatus(
  sessionId: string,
  callback: (status: string) => void
): () => void {
  let lastStatus = "";
  let stopped = false;

  async function poll() {
    if (stopped) return;
    try {
      const session = await getSession(sessionId);
      if (session.status !== lastStatus) {
        lastStatus = session.status;
        callback(session.status);
      }
    } catch {
      // ネットワークエラー時は次のポーリングで再試行
    }
    if (!stopped) {
      setTimeout(poll, 3000);
    }
  }

  void poll();

  return () => {
    stopped = true;
  };
}
