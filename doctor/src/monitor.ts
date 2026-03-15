import {
  collection,
  doc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { getSession, updateSessionStatus, summarizeMissed } from "./api";
import { showToast } from "./toast";

const PATIENT_ORIGIN = import.meta.env.VITE_PATIENT_URL ?? "http://localhost:5173";

/** 段落が「十分に閲覧された」とみなす閾値（秒） */
const DWELL_THRESHOLD = 3;

interface GazeData {
  paragraph_id: string;
  dwell_time: number;
  is_reached: boolean;
}

/** 現在のリスナーを管理 */
let unsubGaze: Unsubscribe | null = null;
let unsubSession: Unsubscribe | null = null;

/** モニタリング画面のリスナーを解除する */
export function cleanupMonitor(): void {
  unsubGaze?.();
  unsubSession?.();
  unsubGaze = null;
  unsubSession = null;
}

/** モニタリング画面をレンダリング */
export async function renderMonitorView(
  container: HTMLElement,
  sessionId: string
): Promise<void> {
  cleanupMonitor();

  container.innerHTML = `<div style="text-align:center;padding:48px;color:#666;">読み込み中...</div>`;

  let session: Record<string, unknown>;
  try {
    session = await getSession(sessionId);
  } catch {
    container.innerHTML = `<div style="color:#d93025;padding:48px;text-align:center;">セッションが見つかりません</div>`;
    return;
  }

  const status = session.status as string;
  const name = session.name as string;
  const documentUrl = session.document_url as string;

  // 文書HTMLを取得
  let docHtml = "";
  if (documentUrl) {
    try {
      const resp = await fetch(documentUrl);
      if (resp.ok) docHtml = await resp.text();
    } catch {
      /* ignore */
    }
  }

  const patientUrl = `${PATIENT_ORIGIN}/?session=${sessionId}`;

  container.innerHTML = `
    <div class="patient-url-banner" style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-weight:600;white-space:nowrap;">患者用URL:</span>
      <code style="background:#fff;padding:4px 8px;border-radius:4px;font-size:13px;word-break:break-all;flex:1;" id="patient-url-text">${patientUrl}</code>
      <button class="btn btn-sm btn-outline" id="btn-copy-url" style="white-space:nowrap;">コピー</button>
    </div>
    <div class="monitor-header">
      <div>
        <h2>${name} 様のモニタリング</h2>
        <span class="status-badge ${status}" id="monitor-status">${statusLabel(status)}</span>
      </div>
      <div id="monitor-actions"></div>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar" id="progress-bar" style="width:0%"></div>
    </div>
    <div id="ai-summary-area"></div>
    <div class="monitor-document" id="monitor-doc">${docHtml || "<p>文書がまだアップロードされていません</p>"}</div>
  `;

  // 患者URLコピーボタン
  document.getElementById("btn-copy-url")?.addEventListener("click", () => {
    navigator.clipboard.writeText(patientUrl).then(() => {
      showToast("URLをコピーしました", "success");
    });
  });

  const monitorStatus = document.getElementById("monitor-status")!;
  const progressBar = document.getElementById("progress-bar")!;
  const actionsDiv = document.getElementById("monitor-actions")!;
  const aiArea = document.getElementById("ai-summary-area")!;
  const monitorDoc = document.getElementById("monitor-doc")!;

  // 段落要素を収集
  const paragraphs = Array.from(
    monitorDoc.querySelectorAll<HTMLElement>("[data-paragraph-id]")
  );

  // 現在の視線データ
  const gazeMap = new Map<string, GazeData>();

  // アクションボタンをレンダリング
  renderActions(actionsDiv, sessionId, status, paragraphs, gazeMap, monitorDoc, aiArea);

  // LiveGaze のリアルタイム監視
  if (paragraphs.length > 0) {
    const gazeRef = collection(db, "Patients", sessionId, "LiveGaze");
    unsubGaze = onSnapshot(gazeRef, (snapshot) => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as GazeData;
        gazeMap.set(data.paragraph_id, data);
      });
      updateVisualization(paragraphs, gazeMap, progressBar);
    });
  }

  // セッションステータスの監視
  const sessionRef = doc(db, "Patients", sessionId);
  unsubSession = onSnapshot(sessionRef, (snap) => {
    const data = snap.data();
    if (!data) return;
    const newStatus = data.status as string;
    monitorStatus.textContent = statusLabel(newStatus);
    monitorStatus.className = `status-badge ${newStatus}`;
    renderActions(actionsDiv, sessionId, newStatus, paragraphs, gazeMap, monitorDoc, aiArea);
  });
}

/** 段落の色分けと進捗を更新 */
function updateVisualization(
  paragraphs: HTMLElement[],
  gazeMap: Map<string, GazeData>,
  progressBar: HTMLElement
): void {
  let okCount = 0;

  for (const el of paragraphs) {
    const id = el.dataset.paragraphId!;
    const gaze = gazeMap.get(id);

    el.classList.remove("gaze-ok", "gaze-missed", "gaze-unseen");

    if (!gaze || !gaze.is_reached) {
      el.classList.add("gaze-unseen");
    } else if (gaze.dwell_time >= DWELL_THRESHOLD) {
      el.classList.add("gaze-ok");
      okCount++;
    } else {
      el.classList.add("gaze-missed");
    }
  }

  const pct = paragraphs.length > 0 ? (okCount / paragraphs.length) * 100 : 0;
  progressBar.style.width = `${pct.toFixed(0)}%`;
}

/** アクションボタンをレンダリング */
function renderActions(
  actionsDiv: HTMLElement,
  sessionId: string,
  status: string,
  paragraphs: HTMLElement[],
  gazeMap: Map<string, GazeData>,
  monitorDoc: HTMLElement,
  aiArea: HTMLElement
): void {
  actionsDiv.innerHTML = "";

  // 見落とし要約ボタン（watching or reviewed のとき）
  if (status === "watching" || status === "reviewed") {
    const btnSummary = document.createElement("button");
    btnSummary.className = "btn btn-outline btn-sm";
    btnSummary.textContent = "AI要約を取得";
    btnSummary.style.marginRight = "8px";
    btnSummary.addEventListener("click", async () => {
      btnSummary.disabled = true;
      btnSummary.textContent = "要約中...";

      const missed = getMissedParagraphs(paragraphs, gazeMap, monitorDoc);
      if (missed.length === 0) {
        aiArea.innerHTML = `<div class="ai-summary"><h3>AI要約</h3><p>見落とし箇所はありません。</p></div>`;
        btnSummary.disabled = false;
        btnSummary.textContent = "AI要約を取得";
        return;
      }

      try {
        const { summary } = await summarizeMissed(sessionId, missed);
        aiArea.innerHTML = `<div class="ai-summary"><h3>AI要約 — 見落とし箇所</h3><p>${summary}</p></div>`;
      } catch (e) {
        showToast(`要約取得エラー: ${e}`, "error");
      }
      btnSummary.disabled = false;
      btnSummary.textContent = "AI要約を取得";
    });
    actionsDiv.appendChild(btnSummary);
  }

  // 最終同意許可ボタン（reviewed のとき）
  if (status === "reviewed") {
    const btnAuth = document.createElement("button");
    btnAuth.className = "btn btn-success btn-sm";
    btnAuth.textContent = "最終同意を許可";
    btnAuth.addEventListener("click", async () => {
      btnAuth.disabled = true;
      try {
        await updateSessionStatus(sessionId, "authorized");
        showToast("最終同意を許可しました", "success");
      } catch (e) {
        showToast(`エラー: ${e}`, "error");
        btnAuth.disabled = false;
      }
    });
    actionsDiv.appendChild(btnAuth);
  }

  // 完了表示
  if (status === "completed") {
    const span = document.createElement("span");
    span.style.color = "#34a853";
    span.style.fontWeight = "bold";
    span.textContent = "同意完了";
    actionsDiv.appendChild(span);
  }
}

/** 見落とし段落（reached だが dwell_time < 閾値）を取得 */
function getMissedParagraphs(
  paragraphs: HTMLElement[],
  gazeMap: Map<string, GazeData>,
  _monitorDoc: HTMLElement
): { id: string; text: string }[] {
  const missed: { id: string; text: string }[] = [];
  for (const el of paragraphs) {
    const id = el.dataset.paragraphId!;
    const gaze = gazeMap.get(id);
    if (gaze && gaze.is_reached && gaze.dwell_time < DWELL_THRESHOLD) {
      missed.push({ id, text: el.textContent?.trim() || "" });
    }
  }
  return missed;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    waiting: "待機中",
    watching: "閲覧中",
    reviewed: "仮確認済み",
    authorized: "同意許可済み",
    completed: "完了",
  };
  return labels[status] ?? status;
}
