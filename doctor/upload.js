// バックエンドAPIのベースURL
const API_BASE = "http://localhost:8081";

const fileInput = document.getElementById("docx-file");
const nameInput = document.getElementById("patient-name");
const idInput = document.getElementById("patient-id");
const btnUpload = document.getElementById("btn-upload");
const statusDiv = document.getElementById("status");
const previewDiv = document.getElementById("preview");

let convertedHtml = "";

// ファイル選択時にDOCX→HTML変換
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setStatus("info", "変換中...");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const rawHtml = result.value;

    // 段落IDを付与
    convertedHtml = addParagraphIds(rawHtml);

    // プレビュー表示
    previewDiv.innerHTML = convertedHtml;
    previewDiv.style.display = "block";

    setStatus("info", `変換完了 — ${countParagraphs(convertedHtml)} 段落を検出`);
    updateButtonState();
  } catch (err) {
    setStatus("error", `変換エラー: ${err.message}`);
    convertedHtml = "";
    updateButtonState();
  }
});

// フォーム入力変更時にボタン状態を更新
nameInput.addEventListener("input", updateButtonState);
idInput.addEventListener("input", updateButtonState);

function updateButtonState() {
  btnUpload.disabled = !(
    convertedHtml &&
    nameInput.value.trim() &&
    idInput.value.trim()
  );
}

// アップロード実行
btnUpload.addEventListener("click", async () => {
  btnUpload.disabled = true;
  btnUpload.textContent = "処理中...";
  setStatus("info", "セッションを作成中...");

  try {
    // 1. セッション作成
    const sessionResp = await fetch(`${API_BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        patient_id: idInput.value.trim(),
      }),
    });

    if (!sessionResp.ok) {
      const err = await sessionResp.json();
      throw new Error(err.error || "セッション作成に失敗");
    }

    const { session_id } = await sessionResp.json();
    setStatus("info", "文書をアップロード中...");

    // 2. 文書アップロード
    const uploadResp = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id,
        html: convertedHtml,
      }),
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.json();
      throw new Error(err.error || "アップロードに失敗");
    }

    // 3. 患者URLを表示
    const patientUrl = `${window.location.origin.replace(
      /:\d+$/,
      ":5173"
    )}/?session=${session_id}`;

    setStatus(
      "success",
      `セッション作成完了！<br>
       <strong>セッションID:</strong> <span class="result-url">${session_id}</span><br>
       <strong>患者URL:</strong> <span class="result-url">${patientUrl}</span>`
    );
  } catch (err) {
    setStatus("error", `エラー: ${err.message}`);
  }

  btnUpload.textContent = "アップロード＆セッション作成";
  btnUpload.disabled = false;
});

/**
 * HTMLの各段落要素に data-paragraph-id を付与する
 */
function addParagraphIds(html) {
  const container = document.createElement("div");
  container.innerHTML = html;

  const targets = container.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li");
  let index = 0;
  targets.forEach((el) => {
    // 空の要素はスキップ
    if (el.textContent.trim()) {
      el.setAttribute("data-paragraph-id", `p-${index}`);
      index++;
    }
  });

  return container.innerHTML;
}

/**
 * HTML内の段落数をカウントする
 */
function countParagraphs(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.querySelectorAll("[data-paragraph-id]").length;
}

function setStatus(type, message) {
  statusDiv.className = type;
  statusDiv.innerHTML = message;
  statusDiv.style.display = "block";
}
