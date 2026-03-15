import "./styles.css";
import { getSession, updateSessionStatus, finalizeSession } from "./api";
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

  // UIを構築
  app.innerHTML = `
    <div class="header">
      <h1>Aurlum - 同意書閲覧</h1>
      <div class="session-info">${session.name} 様</div>
    </div>
    <div class="status-bar watching" id="status-bar">閲覧中</div>
    <div id="document-container"></div>
    <div class="actions">
      <button class="btn btn-primary" id="btn-preliminary" disabled>
        仮確認完了（医師へ送信）
      </button>
      <button class="btn btn-success" id="btn-final" style="display:none" disabled>
        最終同意
      </button>
    </div>
  `;

  const statusBar = document.getElementById("status-bar")!;
  const btnPreliminary = document.getElementById("btn-preliminary") as HTMLButtonElement;
  const btnFinal = document.getElementById("btn-final") as HTMLButtonElement;
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

  // 仮確認ボタンを有効化
  btnPreliminary.disabled = false;

  btnPreliminary.addEventListener("click", async () => {
    btnPreliminary.disabled = true;
    btnPreliminary.textContent = "送信中...";
    try {
      gazeProvider.stop(); // 最終データをフラッシュしてから status を更新
      await updateSessionStatus(sessionId, "reviewed");
      btnPreliminary.textContent = "送信済み - 医師の確認をお待ちください";
      statusBar.textContent = "医師の確認待ち";
      statusBar.className = "status-bar reviewed";
    } catch (e) {
      console.error("Failed to update status:", e);
      gazeProvider.start(paragraphs); // status 更新失敗時は追跡を再開
      gazeProvider.onUpdate(async (gazeData) => {
        try { await syncGazeData(sessionId, gazeData); } catch {}
      });
      btnPreliminary.disabled = false;
      btnPreliminary.textContent = "仮確認完了（医師へ送信）";
    }
  });

  // 医師からのステータス変更を監視
  watchSessionStatus(sessionId, (status) => {
    if (status === "authorized") {
      statusBar.textContent = "医師が最終同意を許可しました";
      statusBar.className = "status-bar authorized";
      btnPreliminary.style.display = "none";
      btnFinal.style.display = "inline-block";
      btnFinal.disabled = false;
    } else if (status === "completed") {
      statusBar.textContent = "同意が完了しました";
      statusBar.className = "status-bar completed";
      btnFinal.disabled = true;
      btnFinal.textContent = "同意済み";
    }
  });

  // 最終同意ボタン — finalize API でハッシュチェーン + KMS署名 + Evidence保存
  btnFinal.addEventListener("click", async () => {
    btnFinal.disabled = true;
    btnFinal.textContent = "処理中...";
    try {
      const result = await finalizeSession(sessionId);
      statusBar.textContent = "同意が完了しました";
      statusBar.className = "status-bar completed";
      btnFinal.textContent = "同意済み";

      // 同意照会番号を表示
      const refDiv = document.createElement("div");
      refDiv.className = "status-bar completed";
      refDiv.style.marginTop = "16px";
      refDiv.innerHTML = `
        <strong>同意照会番号:</strong> ${result.evidence_id}<br>
        <small>ハッシュ: ${result.root_hash.substring(0, 16)}...</small>
      `;
      btnFinal.parentElement?.appendChild(refDiv);
    } catch (e) {
      console.error("Failed to finalize:", e);
      btnFinal.disabled = false;
      btnFinal.textContent = "最終同意";
    }
  });
}

main().catch(console.error);
