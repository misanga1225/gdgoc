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

type GazeStatus = "unseen" | "missed" | "ok";

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
  const paragraphMap = new Map<string, HTMLElement>();
  for (const el of paragraphs) {
    const id = el.dataset.paragraphId;
    if (id) paragraphMap.set(id, el);
  }

  const gazeMap = new Map<string, GazeData>();
  const statusMap = new Map<string, GazeStatus>();
  let okCount = 0;
  for (const [id, el] of paragraphMap) {
    statusMap.set(id, "unseen");
    applyStatusClass(el, "unseen");
  }

  // アクションボタンをレンダリング
  renderActions(actionsDiv, sessionId, status, paragraphs, gazeMap, monitorDoc, aiArea);

  // LiveGaze のリアルタイム監視
  if (paragraphs.length > 0) {
    const gazeRef = collection(db, "Patients", sessionId, "LiveGaze");
    unsubGaze = onSnapshot(gazeRef, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const data = change.doc.data() as GazeData;
        if (!data?.paragraph_id) continue;
        if (change.type === "removed") {
          gazeMap.delete(data.paragraph_id);
        } else {
          gazeMap.set(data.paragraph_id, data);
        }
        applyParagraphStatus(
          data.paragraph_id,
          paragraphMap,
          gazeMap,
          statusMap,
          (deltaOk) => {
            okCount += deltaOk;
          },
        );
      }
      updateProgress(progressBar, okCount, paragraphs.length);
    });
  }

  // セッションステータスの監視
  let prevStatus = status;
  const sessionRef = doc(db, "Patients", sessionId);
  unsubSession = onSnapshot(sessionRef, (snap) => {
    const data = snap.data();
    if (!data) return;
    const newStatus = data.status as string;
    monitorStatus.textContent = statusLabel(newStatus);
    monitorStatus.className = `status-badge ${newStatus}`;
    renderActions(actionsDiv, sessionId, newStatus, paragraphs, gazeMap, monitorDoc, aiArea);

    // reviewed に遷移した瞬間に見落とし通知を自動発火
    if (newStatus === "reviewed" && prevStatus !== "reviewed") {
      autoNotifyOversight(sessionId, paragraphs, gazeMap, monitorDoc, aiArea);
    }
    prevStatus = newStatus;
  });
}

/** 段落の色分けと進捗を更新 */
function classifyStatus(gaze?: GazeData): GazeStatus {
  if (!gaze || !gaze.is_reached) return "unseen";
  return gaze.dwell_time >= DWELL_THRESHOLD ? "ok" : "missed";
}

function applyStatusClass(el: HTMLElement, status: GazeStatus): void {
  el.classList.remove("gaze-ok", "gaze-missed", "gaze-unseen");
  if (status === "ok") {
    el.classList.add("gaze-ok");
  } else if (status === "missed") {
    el.classList.add("gaze-missed");
  } else {
    el.classList.add("gaze-unseen");
  }
}

function applyParagraphStatus(
  id: string,
  paragraphMap: Map<string, HTMLElement>,
  gazeMap: Map<string, GazeData>,
  statusMap: Map<string, GazeStatus>,
  updateOkCount: (delta: number) => void,
): void {
  const el = paragraphMap.get(id);
  if (!el) return;

  const prev = statusMap.get(id) ?? "unseen";
  const next = classifyStatus(gazeMap.get(id));
  if (prev === next) return;

  if (prev === "ok") updateOkCount(-1);
  if (next === "ok") updateOkCount(1);

  statusMap.set(id, next);
  applyStatusClass(el, next);
}

function updateProgress(
  progressBar: HTMLElement,
  okCount: number,
  total: number,
): void {
  const pct = total > 0 ? (okCount / total) * 100 : 0;
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

  // 閲覧状況レポートボタン（watching or reviewed のとき）
  if (status === "watching" || status === "reviewed") {
    const btnSummary = document.createElement("button");
    btnSummary.className = "btn btn-outline btn-sm";
    btnSummary.textContent = "閲覧状況レポートを再取得";
    btnSummary.style.marginRight = "8px";
    btnSummary.addEventListener("click", async () => {
      btnSummary.disabled = true;
      btnSummary.textContent = "分析中...";
      await fetchAndDisplayOversight(sessionId, paragraphs, gazeMap, monitorDoc, aiArea);
      btnSummary.disabled = false;
      btnSummary.textContent = "閲覧状況レポートを再取得";
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
): { id: string; text: string; dwell_time: number }[] {
  const missed: { id: string; text: string; dwell_time: number }[] = [];
  for (const el of paragraphs) {
    const id = el.dataset.paragraphId!;
    const gaze = gazeMap.get(id);
    if (gaze && gaze.is_reached && gaze.dwell_time < DWELL_THRESHOLD) {
      missed.push({ id, text: el.textContent?.trim() || "", dwell_time: gaze.dwell_time });
    }
  }
  return missed;
}

/** 閲覧状況レポートを取得して aiArea に表示する（手動/自動共通） */
async function fetchAndDisplayOversight(
  sessionId: string,
  paragraphs: HTMLElement[],
  gazeMap: Map<string, GazeData>,
  monitorDoc: HTMLElement,
  aiArea: HTMLElement,
): Promise<void> {
  const missed = getMissedParagraphs(paragraphs, gazeMap, monitorDoc);

  if (missed.length === 0) {
    aiArea.innerHTML = `
      <div class="ai-summary" style="border-left:4px solid #34a853;padding:12px 16px;background:#e6f4ea;border-radius:4px;margin:12px 0;">
        <h3 style="margin:0 0 4px;">閲覧状況レポート</h3>
        <p style="margin:0;">全ての段落が基準時間以上閲覧されています。</p>
      </div>`;
    return;
  }

  aiArea.innerHTML = `
    <div class="ai-summary" style="border-left:4px solid #e37400;padding:12px 16px;background:#fef7e0;border-radius:4px;margin:12px 0;">
      <h3 style="margin:0 0 4px;">閲覧状況レポート作成中...</h3>
      <p style="margin:0;">${missed.length}箇所が十分に閲覧されなかった可能性があります。AIが整理しています...</p>
    </div>`;

  try {
    const { summary } = await summarizeMissed(sessionId, missed);
    const wrapper = document.createElement("div");
    wrapper.className = "ai-summary";
    wrapper.style.cssText = "border-left:4px solid #1a73e8;padding:12px 16px;background:#e8f0fe;border-radius:4px;margin:12px 0;";

    const title = document.createElement("h3");
    title.style.cssText = "margin:0 0 8px;";
    title.textContent = `閲覧状況レポート — ${missed.length}箇所`;

    const content = document.createElement("div");
    content.style.cssText = "white-space:pre-wrap;line-height:1.6;";
    content.textContent = summary;

    wrapper.appendChild(title);
    wrapper.appendChild(content);
    aiArea.innerHTML = "";
    aiArea.appendChild(wrapper);
  } catch (e) {
    showToast(`閲覧状況レポートエラー: ${e}`, "error");
    aiArea.innerHTML = `
      <div class="ai-summary" style="border-left:4px solid #1a73e8;padding:12px 16px;background:#e8f0fe;border-radius:4px;margin:12px 0;">
        <h3 style="margin:0 0 4px;">閲覧状況レポート</h3>
        <p style="margin:0;">レポートの取得に失敗しました。「閲覧状況レポートを再取得」ボタンで再試行してください。</p>
      </div>`;
  }
}

/** reviewed 遷移時に自動で見落とし通知を発火 */
async function autoNotifyOversight(
  sessionId: string,
  paragraphs: HTMLElement[],
  gazeMap: Map<string, GazeData>,
  monitorDoc: HTMLElement,
  aiArea: HTMLElement,
): Promise<void> {
  showToast("患者が仮確認を完了しました。閲覧状況レポートを作成中...", "info");
  await fetchAndDisplayOversight(sessionId, paragraphs, gazeMap, monitorDoc, aiArea);
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
