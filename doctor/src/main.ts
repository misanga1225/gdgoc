import "./styles.css";
import { getSession } from "./api";
import { renderUploadView } from "./upload";
import { renderMonitorView, cleanupMonitor } from "./monitor";
import { getSavedSessionIds, addSessionId } from "./sessions";

const app = document.getElementById("app")!;

/** 現在選択中のセッションID */
let activeSessionId: string | null = null;

/** メインUIを構築 */
async function main() {
  app.innerHTML = `
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>Aurlum</h1>
        <button class="btn btn-primary btn-sm" id="btn-new">新規作成</button>
      </div>
      <div class="sidebar-list" id="session-list"></div>
    </div>
    <div class="main-content" id="main-content">
      <div class="empty-state"><p>左のセッション一覧から選択するか、新規作成してください</p></div>
    </div>
  `;

  const btnNew = document.getElementById("btn-new")!;
  const mainContent = document.getElementById("main-content")!;

  btnNew.addEventListener("click", () => {
    activeSessionId = null;
    cleanupMonitor();
    highlightActive();
    renderUploadView(mainContent, (sessionId) => {
      addSessionId(sessionId);
      activeSessionId = sessionId;
      refreshSessionList();
      renderMonitorView(mainContent, sessionId);
    });
  });

  await refreshSessionList();
}

/** セッション一覧を更新 */
async function refreshSessionList() {
  const listEl = document.getElementById("session-list")!;
  const mainContent = document.getElementById("main-content")!;
  const ids = getSavedSessionIds();

  if (ids.length === 0) {
    listEl.innerHTML = `<div style="padding:16px;text-align:center;color:#999;font-size:13px;">セッションなし</div>`;
    return;
  }

  listEl.innerHTML = "";

  for (const id of ids) {
    const card = document.createElement("div");
    card.className = `session-card${id === activeSessionId ? " active" : ""}`;
    card.dataset.sessionId = id;

    // まず最小限の情報を表示
    card.innerHTML = `
      <div class="name">読み込み中...</div>
      <div class="meta">${id.substring(0, 8)}...</div>
    `;
    listEl.appendChild(card);

    // 非同期でセッション情報を取得
    getSession(id)
      .then((session) => {
        const name = (session.name as string) || "不明";
        const status = (session.status as string) || "waiting";
        card.innerHTML = `
          <div class="name">${name}</div>
          <div class="meta">${id.substring(0, 8)}...</div>
          <span class="status-badge ${status}">${statusLabel(status)}</span>
        `;
      })
      .catch(() => {
        card.innerHTML = `
          <div class="name" style="color:#999;">取得エラー</div>
          <div class="meta">${id.substring(0, 8)}...</div>
        `;
      });

    card.addEventListener("click", () => {
      activeSessionId = id;
      cleanupMonitor();
      highlightActive();
      renderMonitorView(mainContent, id);
    });
  }
}

/** アクティブなカードをハイライト */
function highlightActive() {
  const cards = document.querySelectorAll(".session-card");
  cards.forEach((card) => {
    const el = card as HTMLElement;
    el.classList.toggle("active", el.dataset.sessionId === activeSessionId);
  });
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

main().catch(console.error);
