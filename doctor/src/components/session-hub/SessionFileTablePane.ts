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
          <button type="button" class="d02-file-type-icon ${icon.className}" title="元ファイルを開く" aria-label="元ファイルを開く">
            ${icon.svg}
          </button>
          <span class="d02-file-name-text">${file.name}</span>
        </span>
      </td>
      <td>${file.updatedAt}</td>
      <td>${file.kind}</td>
      <td>${file.size}</td>
      <td class="d02-file-action-cell"></td>
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

    const fileTypeIcon = row.querySelector<HTMLButtonElement>(
      ".d02-file-type-icon"
    );
    if (fileTypeIcon) {
      fileTypeIcon.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      fileTypeIcon.addEventListener("dblclick", (event) => {
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
        if (options.onShowPatientUrl) {
          const urlButton = document.createElement("button");
          urlButton.type = "button";
          urlButton.className = "d02-file-url-badge";
          urlButton.textContent = "URL";
          urlButton.title = "患者URLを表示";
          urlButton.setAttribute("aria-label", "患者URLを表示");
          urlButton.addEventListener("click", (event) => {
            event.stopPropagation();
          });
          urlButton.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            options.onShowPatientUrl?.();
          });
          actionCell.append(urlButton);
        }

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
      svg: fileSvgTemplate("P"),
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
  let badgeColor = "#6B7280";
  if (letter === "W") {
    badgeColor = "#2563EB";
  } else if (letter === "P") {
    badgeColor = "#DC2626";
  } else if (letter === "X") {
    badgeColor = "#16A34A";
  }

  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
      <path d="M8 3.5h7.5L20 8v12.5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" fill="#FFFFFF" stroke="#9CA3AF" stroke-width="1.3"/>
      <path d="M15.5 3.5V8H20" stroke="#9CA3AF" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M12.4 11h5.1M12.4 13.2h5.1M12.4 15.4h5.1" stroke="#D1D5DB" stroke-width="1.1" stroke-linecap="round"/>
      <rect x="2.2" y="10.2" width="9.8" height="9.8" rx="1.6" fill="${badgeColor}" />
      <text x="7.1" y="17.1" text-anchor="middle" font-size="5.6" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#FFFFFF">${letter}</text>
    </svg>
  `.trim();
}
