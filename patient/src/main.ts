import "./styles.css";
import { getSession, updateSessionStatus, finalizeSession, sendOtp, verifyOtp } from "./api";
import { loadDocument } from "./document";
import { createGazeProvider, MediaPipeGazeProvider } from "./gaze";
import { syncGazeData, watchSessionStatus } from "./sync";

const app = document.getElementById("app")!;

async function main() {
  // URLからセッションIDを取得
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");

  if (!sessionId) {
    app.innerHTML = `<div class="error">セッションIDが指定されていません。</div>`;
    return;
  }

  app.innerHTML = `<div class="loading">読み込み中...</div>`;

  // セッション情報を取得
  let session;
  try {
    session = await getSession(sessionId);
  } catch {
    app.innerHTML = `<div class="error">セッションが見つかりません。URLを確認してください。</div>`;
    return;
  }

  // OTP本人確認（毎回要求 — 認証済みでも再認証させることで、医師がURLを流用するのを防ぐ）
  await showOtpScreen(sessionId, session.name);

  // UIを構築
  app.innerHTML = `
    <div class="p01-page">
      <div class="p01-top-layer">
        <div class="header">
          <h1>Aurlum - 同意書閲覧</h1>
          <div class="session-info">${session.name} 様</div>
        </div>
        <div class="status-bar watching" id="status-bar">閲覧中</div>
      </div>
      <div id="document-container"></div>
    </div>
  `;

  const statusBar = document.getElementById("status-bar")!;
  const container = document.getElementById("document-container")!;

  // 文書を読み込み
  let paragraphs: HTMLElement[];
  try {
    paragraphs = await loadDocument(session.document_url, container);
  } catch {
    container.innerHTML = `<div class="error">文書の読み込みに失敗しました。</div>`;
    return;
  }

  if (paragraphs.length === 0) {
    container.innerHTML = `<div class="error">文書に段落が見つかりません。</div>`;
    return;
  }

  // ステータスをwatchingに遷移（waiting→watching）
  if (session.status === "waiting") {
    try {
      await updateSessionStatus(sessionId, "watching");
    } catch (e) {
      console.error("Failed to update status to watching:", e);
    }
  }

  // 視線追跡を開始
  statusBar.textContent = "視線追跡を準備中...";
  statusBar.className = "status-bar watching";
  const gazeProvider = await createGazeProvider();

  if (gazeProvider instanceof MediaPipeGazeProvider) {
    // MediaPipe: キャリブレーション実行
    statusBar.textContent = "キャリブレーション中...";
    try {
      const meanError = await gazeProvider.calibrate();
      if (meanError > 0.15) {
        statusBar.textContent = `キャリブレーション精度が低めです（${(meanError * 100).toFixed(1)}%）— 閲覧を続行します`;
        statusBar.className = "status-bar reviewed";
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (e) {
      console.error("キャリブレーション失敗:", e);
    }
    statusBar.textContent = "閲覧中";
    statusBar.className = "status-bar watching";
  } else {
    // Mock フォールバック: カメラが利用できないことを通知
    statusBar.textContent = "カメラが利用できないため簡易追跡モードです";
    statusBar.className = "status-bar reviewed";
    await new Promise((r) => setTimeout(r, 2000));
    statusBar.textContent = "閲覧中";
    statusBar.className = "status-bar watching";
  }

  gazeProvider.onUpdate(async (gazeData) => {
    try {
      await syncGazeData(sessionId, gazeData);
    } catch (e) {
      console.error("Failed to sync gaze data:", e);
    }
  });

  gazeProvider.start(paragraphs);

  // 患者がページを離れたらステータスを未アクセス(waiting)に戻し、戻ったらwatchingに復帰する
  // ただし authorized/completed 状態では遷移しない
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8081";
  let currentStatus = "watching";

  // watchSessionStatusのコールバックでcurrentStatusも同期
  watchSessionStatus(sessionId, (status) => {
    currentStatus = status;
    if (status === "authorized") {
      statusBar.textContent = "医師が最終同意を許可しました";
      statusBar.className = "status-bar authorized";
      showP04ConsentModal(sessionId, statusBar);
    } else if (status === "completed") {
      statusBar.textContent = "同意が完了しました";
      statusBar.className = "status-bar completed";
    }
  });

  document.addEventListener("visibilitychange", () => {
    // authorized/completed 状態ではステータスを変更しない
    if (currentStatus === "authorized" || currentStatus === "completed") return;

    if (document.visibilityState === "hidden") {
      currentStatus = "waiting";
      fetch(`${API_BASE}/sessions/${sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "waiting" }),
        keepalive: true,
      }).catch(() => {});
    } else if (document.visibilityState === "visible") {
      currentStatus = "watching";
      fetch(`${API_BASE}/sessions/${sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "watching" }),
      }).catch(() => {});
    }
  });

}

/** 患者用終了同意モーダル（P-04）を表示する */
function showP04ConsentModal(sessionId: string, statusBar: HTMLElement): void {
  if (document.getElementById("p04-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "p04-overlay";
  overlay.className = "p04-overlay";

  const dialog = document.createElement("section");
  dialog.className = "p04-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "p04-title");
  dialog.setAttribute("aria-describedby", "p04-description");

  dialog.innerHTML = `
    <h2 id="p04-title" class="p04-title">確認して説明を終了しますか？</h2>
    <p id="p04-description" class="p04-description">内容を確認し、問題なければ終了を確定してください。</p>
    <ul class="p04-checklist">
      <li>・説明内容を理解した</li>
      <li>・質問事項は解消した</li>
      <li>・確認して説明を終了する</li>
    </ul>
    <p class="p04-error" id="p04-error" hidden></p>
    <div class="p04-actions">
      <button type="button" class="btn p04-cancel" id="p04-cancel">キャンセル</button>
      <button type="button" class="btn btn-success p04-confirm" id="p04-confirm">確認して説明を終了</button>
    </div>
  `;

  overlay.append(dialog);
  document.body.append(overlay);
  document.body.classList.add("modal-open");

  const cancelButton = dialog.querySelector<HTMLButtonElement>("#p04-cancel");
  const confirmButton = dialog.querySelector<HTMLButtonElement>("#p04-confirm");
  const errorText = dialog.querySelector<HTMLElement>("#p04-error");

  const close = (): void => {
    overlay.remove();
    document.body.classList.remove("modal-open");
  };

  cancelButton?.addEventListener("click", () => {
    close();
  });

  confirmButton?.addEventListener("click", async () => {
    if (!confirmButton) return;
    confirmButton.disabled = true;
    confirmButton.textContent = "処理中...";
    if (errorText) {
      errorText.hidden = true;
      errorText.textContent = "";
    }
    try {
      await finalizeSession(sessionId);
      statusBar.textContent = "同意が完了しました";
      statusBar.className = "status-bar completed";
      close();
    } catch (e) {
      confirmButton.disabled = false;
      confirmButton.textContent = "確認して説明を終了";
      if (errorText) {
        errorText.hidden = false;
        errorText.textContent = `エラーが発生しました: ${e instanceof Error ? e.message : e}`;
      }
    }
  });
}

/** OTP本人確認画面を表示し、検証完了まで待機する */
function showOtpScreen(sessionId: string, patientName: string): Promise<void> {
  return new Promise((resolve) => {
    app.innerHTML = `
      <div class="header">
        <h1>Aurlum - 本人確認</h1>
        <div class="session-info">${patientName} 様</div>
      </div>
      <div style="max-width:400px;margin:40px auto;padding:24px;">
        <p>同意書を閲覧するには、本人確認が必要です。</p>
        <p>登録されたメールアドレスに認証コードを送信します。</p>
        <button class="btn btn-primary btn-block" id="btn-send-otp">認証コードを送信</button>
        <div id="otp-input-area" style="display:none;margin-top:20px;">
          <label for="otp-code">6桁の認証コード</label>
          <input type="text" id="otp-code" maxlength="6" pattern="[0-9]{6}"
            placeholder="000000" style="font-size:24px;text-align:center;letter-spacing:8px;width:100%;padding:12px;margin:8px 0;" />
          <button class="btn btn-primary btn-block" id="btn-verify-otp">確認</button>
          <button class="btn btn-block" id="btn-resend-otp" style="margin-top:8px;">再送信</button>
        </div>
        <div id="otp-message" style="margin-top:12px;"></div>
      </div>
    `;

    const btnSend = document.getElementById("btn-send-otp") as HTMLButtonElement;
    const otpInputArea = document.getElementById("otp-input-area")!;
    const otpInput = document.getElementById("otp-code") as HTMLInputElement;
    const btnVerify = document.getElementById("btn-verify-otp") as HTMLButtonElement;
    const btnResend = document.getElementById("btn-resend-otp") as HTMLButtonElement;
    const message = document.getElementById("otp-message")!;

    async function doSendOtp() {
      btnSend.disabled = true;
      btnSend.textContent = "送信中...";
      message.textContent = "";
      try {
        await sendOtp(sessionId);
        otpInputArea.style.display = "block";
        btnSend.style.display = "none";
        message.textContent = "認証コードをメールに送信しました（5分間有効）";
        message.style.color = "#059669";
        otpInput.focus();
      } catch (e) {
        message.textContent = `送信エラー: ${e instanceof Error ? e.message : e}`;
        message.style.color = "#dc2626";
        btnSend.disabled = false;
        btnSend.textContent = "認証コードを送信";
      }
    }

    btnSend.addEventListener("click", doSendOtp);
    btnResend.addEventListener("click", async () => {
      btnResend.disabled = true;
      try {
        await sendOtp(sessionId);
        message.textContent = "認証コードを再送信しました";
        message.style.color = "#059669";
      } catch (e) {
        message.textContent = `再送信エラー: ${e instanceof Error ? e.message : e}`;
        message.style.color = "#dc2626";
      }
      btnResend.disabled = false;
    });

    btnVerify.addEventListener("click", async () => {
      const code = otpInput.value.trim();
      if (code.length !== 6) {
        message.textContent = "6桁のコードを入力してください";
        message.style.color = "#dc2626";
        return;
      }
      btnVerify.disabled = true;
      btnVerify.textContent = "確認中...";
      try {
        const result = await verifyOtp(sessionId, code);
        if (result.verified) {
          resolve();
        }
      } catch (e) {
        message.textContent = `${e instanceof Error ? e.message : e}`;
        message.style.color = "#dc2626";
        btnVerify.disabled = false;
        btnVerify.textContent = "確認";
      }
    });

    // Enterキーで確認
    otpInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        btnVerify.click();
      }
    });
  });
}

main().catch(console.error);
