import { showToast } from "../../toast";

export function showPatientUrlDialog(url: string, onClose: () => void): void {
  const backdrop = document.createElement("div");
  backdrop.className = "d02-url-dialog-backdrop";
  Object.assign(backdrop.style, {
    position: "fixed",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.45)",
    zIndex: "9999",
  });

  const box = document.createElement("div");
  box.className = "d02-url-dialog-box";
  Object.assign(box.style, {
    background: "#fff",
    borderRadius: "12px",
    padding: "28px 32px",
    maxWidth: "520px",
    width: "90%",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  });

  const title = document.createElement("h3");
  title.textContent = "患者用URLが発行されました";
  Object.assign(title.style, {
    margin: "0",
    fontSize: "16px",
    fontWeight: "600",
  });

  const desc = document.createElement("p");
  desc.textContent = "以下のURLを患者に共有してください。";
  Object.assign(desc.style, {
    margin: "0",
    fontSize: "13px",
    color: "#666",
  });

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.readOnly = true;
  urlInput.value = url;
  Object.assign(urlInput.style, {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    fontSize: "13px",
    boxSizing: "border-box",
    color: "#333",
    background: "#f8f8f8",
  });

  const buttonRow = document.createElement("div");
  Object.assign(buttonRow.style, {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  });

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "コピー";
  Object.assign(copyBtn.style, {
    padding: "8px 18px",
    borderRadius: "6px",
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontSize: "13px",
    cursor: "pointer",
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("URLをコピーしました", "success");
    } catch {
      urlInput.select();
      document.execCommand("copy");
      showToast("URLをコピーしました", "success");
    }
  });

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "閉じる";
  Object.assign(closeBtn.style, {
    padding: "8px 18px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    background: "#fff",
    color: "#333",
    fontSize: "13px",
    cursor: "pointer",
  });

  function close(): void {
    backdrop.remove();
    onClose();
  }

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  buttonRow.append(copyBtn, closeBtn);
  box.append(title, desc, urlInput, buttonRow);
  backdrop.append(box);
  document.body.append(backdrop);

  urlInput.focus();
  urlInput.select();
}
