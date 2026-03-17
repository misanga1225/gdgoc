import "../../shared/styles/tokens.css";
import "../../shared/styles/base.css";
import "./styles.css";
import "./styles/doctor-main.css";
import "./styles/d01-login.css";
import { getSession } from "./api";
import { renderMonitorView, cleanupMonitor } from "./monitor";
import { renderDoctorMainPage } from "./pages/DoctorMainPage";
import { renderDoctorLoginPage } from "./pages/DoctorLoginPage";
import { addSessionId, getSavedSessionIds } from "./sessions";
import { renderUploadView } from "./upload";

const app = document.getElementById("app")!;

let activeSessionId: string | null = null;

async function main() {
  const loginPage = renderDoctorLoginPage({
    onLoginSuccess: () => {
      renderDoctorShell().catch(console.error);
    },
  });

  app.innerHTML = "";
  app.append(loginPage);
}

async function renderDoctorShell() {
  app.innerHTML = `
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>Aurlum</h1>
        <div class="sidebar-actions">
          <button class="btn btn-secondary btn-sm" id="btn-d05-mock">D-05</button>
          <button class="btn btn-primary btn-sm" id="btn-new">新規作成</button>
        </div>
      </div>
      <div class="sidebar-list" id="session-list"></div>
    </div>
    <div class="main-content" id="main-content">
      <div class="empty-state"><p>左のセッション一覧から選択するか、新規作成してください</p></div>
    </div>
  `;

  const btnNew = document.getElementById("btn-new")!;
  const btnD05Mock = document.getElementById("btn-d05-mock")!;
  const mainContent = document.getElementById("main-content")!;

  btnD05Mock.addEventListener("click", () => {
    activeSessionId = null;
    cleanupMonitor();
    highlightActive();
    mainContent.classList.add("main-content--d05");
    renderDoctorMainPage(mainContent);
  });

  btnNew.addEventListener("click", () => {
    activeSessionId = null;
    cleanupMonitor();
    highlightActive();
    mainContent.classList.remove("main-content--d05");
    renderUploadView(mainContent, (sessionId) => {
      addSessionId(sessionId);
      activeSessionId = sessionId;
      refreshSessionList();
      mainContent.classList.remove("main-content--d05");
      renderMonitorView(mainContent, sessionId);
    });
  });

  await refreshSessionList();
}

async function refreshSessionList() {
  const listEl = document.getElementById("session-list")!;
  const mainContent = document.getElementById("main-content")!;
  const ids = getSavedSessionIds();

  if (ids.length === 0) {
    listEl.innerHTML = "<div style=\"padding:16px;text-align:center;color:#999;font-size:13px;\">セッションなし</div>";
    return;
  }

  listEl.innerHTML = "";

  for (const id of ids) {
    const card = document.createElement("div");
    card.className = `session-card${id === activeSessionId ? " active" : ""}`;
    card.dataset.sessionId = id;

    card.innerHTML = `
      <div class="name">読み込み中...</div>
      <div class="meta">${id.substring(0, 8)}...</div>
    `;
    listEl.appendChild(card);

    getSession(id)
      .then((session) => {
        const name = (session.name as string) || "患者";
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
      mainContent.classList.remove("main-content--d05");
      renderMonitorView(mainContent, id);
    });
  }
}

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
    reviewed: "要説明あり",
    authorized: "許可済み",
    completed: "完了",
  };
  return labels[status] ?? status;
}

main().catch(console.error);
