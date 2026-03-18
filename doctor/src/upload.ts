import mammoth from "mammoth";
import { createSession, uploadDocument } from "./api";
import { showToast } from "./toast";

export interface UploadViewOptions {
  initialName?: string;
  initialPatientId?: string;
  heading?: string;
  submitLabel?: string;
  targetSessionId?: string;
  targetFileId?: string;
}

function addParagraphIds(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const targets = container.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li");
  let index = 0;
  targets.forEach((element) => {
    if (element.textContent?.trim()) {
      element.setAttribute("data-paragraph-id", `p-${index}`);
      index += 1;
    }
  });
  return container.innerHTML;
}

export function renderUploadView(
  container: HTMLElement,
  onSessionCreated: (sessionId: string) => void,
  options?: UploadViewOptions
): void {
  let convertedHtml = "";
  const heading = options?.heading ?? "資料アップロード";
  const submitLabel = options?.submitLabel ?? "アップロードしてセッション作成";

  container.innerHTML = `
    <div class="upload-form">
      <h2>${heading}</h2>
      <div class="form-group">
        <label for="patient-name">患者名</label>
        <input type="text" id="patient-name" placeholder="例: 田中 太郎" />
      </div>
      <div class="form-group">
        <label for="patient-id">カルテID</label>
        <input type="text" id="patient-id" placeholder="例: P001" />
      </div>
      <div class="form-group">
        <label for="docx-file">資料ファイル (.docx)</label>
        <input type="file" id="docx-file" accept=".docx" />
      </div>
      <div id="upload-preview" style="display:none; margin-top:12px; padding:12px; border:1px solid #ddd; border-radius:6px; max-height:200px; overflow-y:auto; font-size:13px;"></div>
      <div id="upload-info" style="margin-top:8px; font-size:13px; color:#666;"></div>
      <button class="btn btn-primary btn-block" id="btn-upload" disabled style="margin-top:20px;">
        ${submitLabel}
      </button>
    </div>
  `;

  const nameInput = document.getElementById("patient-name") as HTMLInputElement;
  const idInput = document.getElementById("patient-id") as HTMLInputElement;
  const fileInput = document.getElementById("docx-file") as HTMLInputElement;
  const btnUpload = document.getElementById("btn-upload") as HTMLButtonElement;
  const preview = document.getElementById("upload-preview") as HTMLDivElement;
  const info = document.getElementById("upload-info") as HTMLDivElement;

  if (options?.initialName) {
    nameInput.value = options.initialName;
  }
  if (options?.initialPatientId) {
    idInput.value = options.initialPatientId;
  }

  function updateButtonDisabled(): void {
    btnUpload.disabled = !(
      convertedHtml &&
      nameInput.value.trim() &&
      idInput.value.trim()
    );
  }

  nameInput.addEventListener("input", updateButtonDisabled);
  idInput.addEventListener("input", updateButtonDisabled);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    info.textContent = "変換中...";
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      convertedHtml = addParagraphIds(result.value);

      preview.innerHTML = convertedHtml;
      preview.style.display = "block";

      const temp = document.createElement("div");
      temp.innerHTML = convertedHtml;
      const paragraphCount = temp.querySelectorAll("[data-paragraph-id]").length;
      info.textContent = `変換完了: ${paragraphCount} 段落`;
      updateButtonDisabled();
    } catch (error) {
      info.textContent = `変換エラー: ${error}`;
      convertedHtml = "";
      updateButtonDisabled();
    }
  });

  btnUpload.addEventListener("click", async () => {
    btnUpload.disabled = true;
    btnUpload.textContent = "送信中...";

    try {
      let destinationSessionId = options?.targetSessionId;
      if (!destinationSessionId) {
        const { session_id } = await createSession(
          nameInput.value.trim(),
          idInput.value.trim()
        );
        destinationSessionId = session_id;
      }

      await uploadDocument(destinationSessionId, convertedHtml);

      if (options?.targetSessionId) {
        showToast("選択中のセッションに資料を追加しました", "success");
      } else {
        showToast("セッションを作成しました", "success");
      }

      onSessionCreated(destinationSessionId);
    } catch (error) {
      showToast(`エラー: ${error}`, "error");
      btnUpload.disabled = false;
      btnUpload.textContent = submitLabel;
      return;
    }

    btnUpload.textContent = submitLabel;
    btnUpload.disabled = false;
  });
}
