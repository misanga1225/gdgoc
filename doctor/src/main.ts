import "../../shared/styles/tokens.css";
import "../../shared/styles/base.css";
import "./styles.css";
import "./styles/doctor-main.css";
import { getSession } from "./api";
import { renderUploadView } from "./upload";
import { renderMonitorView, cleanupMonitor } from "./monitor";
import { getSavedSessionIds, addSessionId } from "./sessions";
import { renderDoctorMainPage } from "./pages/DoctorMainPage";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

const app = document.getElementById("app")!;

/** ログイン画面を表示 */
function renderLoginView() {
  app.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5;">
      <div style="background:white;padding:40px;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,0.1);width:360px;">
        <h1 style="margin:0 0 8px;font-size:24px;">Aurlum</h1>
        <p style="margin:0 0 24px;color:#666;font-size:14px;">医師としてログイン</p>
        <div id="login-error" style="display:none;color:#e53e3e;font-size:13px;margin-bottom:16px;"></div>
        <input id="login-email" type="email" placeholder="メールアドレス"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:12px;" />
        <input id="login-password" type="password" placeholder="パスワード"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:16px;" />
        <button id="login-btn"
          style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">
          ログイン
        </button>
      </div>
    </div>
  `;

  const emailEl = document.getElementById("login-email") as HTMLInputElement;
  const passwordEl = document.getElementById("login-password") as HTMLInputElement;
  const errorEl = document.getElementById("login-error")!;
  const loginBtn = document.getElementById("login-btn")!;

  loginBtn.addEventListener("click", async () => {
    errorEl.style.display = "none";
    loginBtn.textContent = "ログイン中...";
    try {
      await signInWithEmailAndPassword(auth, emailEl.value, passwordEl.value);
      // onAuthStateChanged が main() を呼ぶ
    } catch {
      errorEl.textContent = "メールアドレスまたはパスワードが正しくありません";
      errorEl.style.display = "block";
      loginBtn.textContent = "ログイン";
    }
  });

  passwordEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });
}

/** 現在選択中のセッションID */
let activeSessionId: string | null = null;

/** メインUIを構築 */
async function main() {
  app.innerHTML = `
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>Aurlum</h1>
        <div class="sidebar-actions">
          <button class="btn btn-secondary btn-sm" id="btn-d05-mock">D-05</button>
          <button class="btn btn-primary btn-sm" id="btn-new">新規作成</button>
          <button class="btn btn-secondary btn-sm" id="btn-logout">ログアウト</button>
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
  const btnLogout = document.getElementById("btn-logout")!;
  btnLogout.addEventListener("click", () => signOut(auth));
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
      mainContent.classList.remove("main-content--d05");
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

// ログイン状態を監視してUIを切り替える
onAuthStateChanged(auth, (user) => {
  if (user) {
    main().catch(console.error);
  } else if (import.meta.env.DEV) {
    // 開発環境ではログインをスキップしてそのままメインUIを表示
    main().catch(console.error);
  } else {
    renderLoginView();
  }
});
