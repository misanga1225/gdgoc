import mammoth from "mammoth";
import { createSession, uploadDocument } from "./api";
import { showToast } from "./toast";

/** DOCX→HTML変換時に段落IDを付与する */
function addParagraphIds(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const targets = container.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li");
  let index = 0;
  targets.forEach((el) => {
    if (el.textContent?.trim()) {
      el.setAttribute("data-paragraph-id", `p-${index}`);
      index++;
    }
  });
  return container.innerHTML;
}

/** アップロード画面をレンダリング */
export function renderUploadView(
  container: HTMLElement,
  onSessionCreated: (sessionId: string) => void
): void {
  let convertedHtml = "";

  container.innerHTML = `
    <div class="upload-form">
      <h2>文書アップロード</h2>
      <div class="form-group">
        <label for="patient-name">患者名</label>
        <input type="text" id="patient-name" placeholder="例: 佐藤 太郎" />
      </div>
      <div class="form-group">
        <label for="patient-id">カルテID</label>
        <input type="text" id="patient-id" placeholder="例: P001" />
      </div>
      <div class="form-group">
        <label for="docx-file">同意書ファイル (.docx)</label>
        <input type="file" id="docx-file" accept=".docx" />
      </div>
      <div id="upload-preview" style="display:none; margin-top:12px; padding:12px; border:1px solid #ddd; border-radius:6px; max-height:200px; overflow-y:auto; font-size:13px;"></div>
      <div id="upload-info" style="margin-top:8px; font-size:13px; color:#666;"></div>
      <button class="btn btn-primary btn-block" id="btn-upload" disabled style="margin-top:20px;">
        アップロード＆セッション作成
      </button>
    </div>
  `;

  const nameInput = document.getElementById("patient-name") as HTMLInputElement;
  const idInput = document.getElementById("patient-id") as HTMLInputElement;
  const fileInput = document.getElementById("docx-file") as HTMLInputElement;
  const btnUpload = document.getElementById("btn-upload") as HTMLButtonElement;
  const preview = document.getElementById("upload-preview")!;
  const info = document.getElementById("upload-info")!;

  function updateBtn() {
    btnUpload.disabled = !(convertedHtml && nameInput.value.trim() && idInput.value.trim());
  }

  nameInput.addEventListener("input", updateBtn);
  idInput.addEventListener("input", updateBtn);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    info.textContent = "変換中...";
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      convertedHtml = addParagraphIds(result.value);

      preview.innerHTML = convertedHtml;
      preview.style.display = "block";

      const count = document.createElement("div");
      count.innerHTML = convertedHtml;
      const n = count.querySelectorAll("[data-paragraph-id]").length;
      info.textContent = `変換完了 — ${n} 段落を検出`;
      updateBtn();
    } catch (e) {
      info.textContent = `変換エラー: ${e}`;
      convertedHtml = "";
      updateBtn();
    }
  });

  btnUpload.addEventListener("click", async () => {
    btnUpload.disabled = true;
    btnUpload.textContent = "処理中...";

    try {
      const { session_id } = await createSession(
        nameInput.value.trim(),
        idInput.value.trim()
      );
      await uploadDocument(session_id, convertedHtml);

      showToast("セッション作成完了", "success");
      onSessionCreated(session_id);
    } catch (e) {
      showToast(`エラー: ${e}`, "error");
    }

    btnUpload.textContent = "アップロード＆セッション作成";
    btnUpload.disabled = false;
  });
}
