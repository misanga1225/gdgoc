export type SessionStatusLabel = "未アクセス" | "閲覧中" | "確認待ち" | "同意許可済" | "完了";

export interface PatientSessionRow {
  id: string;
  name: string;
  chartId: string;
  statusLabel: SessionStatusLabel;
}

export interface PatientSessionListPaneOptions {
  rows: PatientSessionRow[];
  selectedId: string | null;
  loginLabel: string;
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onClearSelection: () => void;
  onSelect: (id: string) => void;
  onOpenD05: (id: string) => void;
  onDelete?: (id: string) => void;
  onLogout?: () => void;
}

export function renderPatientSessionListPane(
  options: PatientSessionListPaneOptions
): HTMLElement {
  const pane = document.createElement("aside");
  pane.className = "d02-left-pane";

  const header = document.createElement("div");
  header.className = "d02-left-header";

  const title = document.createElement("h2");
  title.className = "d02-pane-title";
  title.textContent = "ファイル管理システム";
  title.title = title.textContent;

  const loginMeta = document.createElement("span");
  loginMeta.className = "d02-login-meta";
  loginMeta.textContent = options.loginLabel;
  loginMeta.title = options.loginLabel;

  const searchForm = document.createElement("form");
  searchForm.className = "d02-search-form";

  const searchIcon = document.createElement("span");
  searchIcon.className = "d02-search-icon";
  searchIcon.setAttribute("aria-hidden", "true");
  searchIcon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="2"></circle>
      <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
    </svg>
  `;

  const search = document.createElement("input");
  search.className = "d02-search-input";
  search.placeholder = "名前・IDで検索...";
  search.value = options.searchDraft;

  let isComposing = false;
  search.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  search.addEventListener("compositionend", () => {
    isComposing = false;
  });
  search.addEventListener("input", () => {
    options.onSearchDraftChange(search.value);
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && isComposing) {
      event.preventDefault();
    }
  });

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (isComposing) {
      return;
    }
    options.onSearchSubmit(search.value);
  });

  searchForm.append(searchIcon, search);

  const list = document.createElement("div");
  list.className = "d02-patient-list";
  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".d02-patient-item")) {
      return;
    }
    options.onClearSelection();
  });

  if (options.rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "d02-empty-text";
    empty.textContent = "該当するファイルがありません";
    list.append(empty);
  }

  for (const row of options.rows) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `d02-patient-item${row.id === options.selectedId ? " is-selected" : ""}`;

    item.innerHTML = `
      <div class="d02-patient-main">
        <div class="d02-patient-name">${row.name}</div>
        <span class="d02-status-chip ${row.statusLabel === "閲覧中" ? "is-viewing" : row.statusLabel === "未アクセス" ? "is-away" : "is-done"}">${row.statusLabel}</span>
      </div>
      <div class="d02-patient-meta">ID - ${row.chartId}</div>
    `;

    item.addEventListener("click", () => {
      options.onSelect(row.id);
    });

    item.addEventListener("dblclick", () => {
      options.onOpenD05(row.id);
    });

    if (options.onDelete) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "d02-delete-btn";
      deleteBtn.textContent = "✕";
      deleteBtn.title = "削除";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        options.onDelete!(row.id);
      });
      item.querySelector(".d02-patient-main")?.append(deleteBtn);
    }

    list.append(item);
  }

  if (options.onLogout) {
    const loginRow = document.createElement("div");
    loginRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:4px;";
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "btn btn-secondary btn-sm";
    logoutBtn.textContent = "ログアウト";
    logoutBtn.addEventListener("click", options.onLogout);
    loginRow.append(loginMeta, logoutBtn);
    header.append(title, loginRow);
  } else {
    header.append(title, loginMeta);
  }
  pane.append(header, searchForm, list);
  return pane;
}
