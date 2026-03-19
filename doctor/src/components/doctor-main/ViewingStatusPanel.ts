import { renderProgressBar } from "./ProgressBar";

export interface UnviewedSectionItem {
  id: string;
  title: string;
  sectionId: string;
}

export interface ViewingStatusPanelOptions {
  hasFetchedResult: boolean;
  elapsedTimeLabel: string;
  progressPercent: number;
  unviewedSections: UnviewedSectionItem[];
  emptyResultLabel?: string;
}

export function renderViewingStatusPanel(
  options: ViewingStatusPanelOptions
): HTMLElement {
  const panel = document.createElement("aside");
  panel.className = "d05-status-panel";

  if (!options.hasFetchedResult) {
    const empty = document.createElement("p");
    empty.className = "d05-status-empty";
    empty.textContent = "更新ボタンを押すと閲覧状況を確認できます。";
    panel.append(empty);
    return panel;
  }

  const elapsed = document.createElement("div");
  elapsed.className = "d05-elapsed";
  elapsed.innerHTML = `<span class="d05-status-label">経過時間</span><strong>${options.elapsedTimeLabel}</strong>`;

  const progress = renderProgressBar({ percent: options.progressPercent });

  const listWrap = document.createElement("div");
  listWrap.className = "d05-unviewed-list";

  const items = options.unviewedSections;
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "d05-status-empty";
    empty.textContent = options.emptyResultLabel ?? "見落としはありません。";
    listWrap.append(empty);
  } else {
    for (const section of items) {
      const item = document.createElement("article");
      item.className = "d05-unviewed-item";
      item.dataset.sectionId = section.sectionId;
      item.textContent = section.title;
      listWrap.append(item);
    }
  }

  panel.append(elapsed, progress, listWrap);
  return panel;
}
