import "./styles.css";
import { getSession, updateSessionStatus } from "./api";
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

  // 医師からのステータス変更を監視
  watchSessionStatus(sessionId, (status) => {
    if (status === "authorized") {
      statusBar.textContent = "医師が最終同意を許可しました";
      statusBar.className = "status-bar authorized";
    } else if (status === "completed") {
      statusBar.textContent = "同意が完了しました";
      statusBar.className = "status-bar completed";
    }
  });
}

main().catch(console.error);
