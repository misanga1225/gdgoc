export interface DocumentAddPaneOptions {
  onAddClick: () => void;
}

export function renderDocumentAddPane(
  options: DocumentAddPaneOptions
): HTMLElement {
  const pane = document.createElement("aside");
  pane.className = "d02-right-pane";

  const header = document.createElement("header");
  header.className = "d02-upload-header";
  header.innerHTML = `<h2 class="d02-pane-title">資料ファイルアップロード</h2>`;

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "d02-add-document-button";
  addButton.innerHTML = `
    <span class="d02-add-document-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        <path d="M8.5 9.5L12 6l3.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M5 15.5v2A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
      </svg>
    </span>
    <span class="d02-add-document-title">資料アップロード</span>
    <span class="d02-add-document-subtitle">クリックしてファイルを選択</span>
  `;
  addButton.addEventListener("click", () => {
    options.onAddClick();
  });

  pane.append(header, addButton);
  return pane;
}
