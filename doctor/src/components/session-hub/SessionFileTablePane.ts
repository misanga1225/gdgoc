import type { SessionFileItem } from "../../state/sessionHubState";

export interface SessionFileTablePaneOptions {
  sessionName: string;
  sessionChartId: string;
  files: SessionFileItem[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onOpenFile: (fileId: string) => void;
  onOpenOriginalFile: (fileId: string) => void;
  onRequestDelete: (fileId: string) => void;
  onShowPatientUrl?: () => void;
}

export function renderSessionFileTablePane(
  options: SessionFileTablePaneOptions
): HTMLElement {
  const pane = document.createElement("section");
  pane.className = "d02-center-pane";

  const header = document.createElement("header");
  header.className = "d02-file-header";

  const headerTop = document.createElement("div");
  headerTop.style.display = "flex";
  headerTop.style.alignItems = "center";
  headerTop.style.justifyContent = "space-between";

  const headerText = document.createElement("div");
  headerText.innerHTML = `
    <h2 class="d02-file-title">${options.sessionName} のファイル</h2>
    <p class="d02-file-meta">ID - ${options.sessionChartId} ・ ${options.files.length}件のファイル</p>
  `;

  headerTop.append(headerText);

  if (options.onShowPatientUrl && options.files.length > 0) {
    const urlBtn = document.createElement("button");
    urlBtn.type = "button";
    urlBtn.textContent = "患者URL";
    Object.assign(urlBtn.style, {
      padding: "6px 14px",
      borderRadius: "6px",
      border: "1px solid #2563eb",
      background: "transparent",
      color: "#2563eb",
      fontSize: "12px",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    urlBtn.addEventListener("click", () => options.onShowPatientUrl!());
    headerTop.append(urlBtn);
  }

  header.append(headerTop);

  const tableWrap = document.createElement("div");
  tableWrap.className = "d02-file-table-wrap";

  const table = document.createElement("table");
  table.className = "d02-file-table";

  table.innerHTML = `
    <thead>
      <tr>
        <th>ファイル名</th>
        <th>更新日時</th>
        <th>種類</th>
        <th>サイズ</th>
        <th class="d02-col-action">操作</th>
      </tr>
    </thead>
  `;

  const body = document.createElement("tbody");

  if (options.files.length === 0) {
    const row = document.createElement("tr");
    row.className = "d02-file-empty-row";
    row.innerHTML = `<td colspan="5">ファイルがありません</td>`;
    body.append(row);
  }

  for (const file of options.files) {
    const row = document.createElement("tr");
    row.className = `d02-file-row${options.selectedFileId === file.id ? " is-selected" : ""}`;
    row.tabIndex = 0;

    const icon = createFileIcon(file.kind);
    row.innerHTML = `
      <td class="d02-file-name">
        <span class="d02-file-name-cell">
          <span class="d02-file-type-icon ${icon.className}" aria-hidden="true">${icon.svg}</span>
          <span class="d02-file-name-text">${file.name}</span>
        </span>
      </td>
      <td>${file.updatedAt}</td>
      <td>${file.kind}</td>
      <td>${file.size}</td>
      <td class="d02-file-action-cell">
        <button type="button" class="d02-file-open-original-button" title="元ファイルを開く" aria-label="元ファイルを開く">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
            <path d="M14 4h6v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M20 4L10 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
          </svg>
        </button>
      </td>
    `;

    row.addEventListener("click", () => {
      options.onSelectFile(file.id);
    });

    row.addEventListener("dblclick", () => {
      options.onOpenFile(file.id);
    });

    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        options.onOpenFile(file.id);
      }
    });

    const openOriginalButton = row.querySelector<HTMLButtonElement>(
      ".d02-file-open-original-button"
    );
    if (openOriginalButton) {
      openOriginalButton.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      openOriginalButton.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onOpenOriginalFile(file.id);
      });
    }

    if (options.selectedFileId === file.id) {
      const actionCell = row.querySelector<HTMLTableCellElement>(
        ".d02-file-action-cell"
      );
      if (actionCell) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "d02-file-delete-button";
        deleteButton.innerHTML = `
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
            <path d="M6 7h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            <path d="M10 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            <path d="M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            <path d="M9 7l1-2h4l1 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
          </svg>
        `;
        deleteButton.title = "削除";
        deleteButton.setAttribute("aria-label", "削除");
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          options.onRequestDelete(file.id);
        });
        actionCell.append(deleteButton);
      }
    }

    body.append(row);
  }

  table.append(body);
  tableWrap.append(table);
  pane.append(header, tableWrap);
  return pane;
}

function createFileIcon(kind: string): { className: string; svg: string } {
  const normalized = kind.toLowerCase();
  if (normalized.includes("pdf")) {
    return {
      className: "is-pdf",
      svg: fileSvgTemplate("PDF"),
    };
  }
  if (normalized.includes("word")) {
    return {
      className: "is-word",
      svg: fileSvgTemplate("W"),
    };
  }
  if (normalized.includes("excel")) {
    return {
      className: "is-excel",
      svg: fileSvgTemplate("X"),
    };
  }
  return {
    className: "is-generic",
    svg: fileSvgTemplate("F"),
  };
}

function fileSvgTemplate(letter: string): string {
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8"/>
      <path d="M14 3v5h5" stroke="currentColor" stroke-width="1.8"/>
      <text x="12" y="17" text-anchor="middle" font-size="7.2" font-family="Arial, sans-serif" fill="currentColor">${letter}</text>
    </svg>
  `.trim();
}
