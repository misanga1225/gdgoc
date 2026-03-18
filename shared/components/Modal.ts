import { createButton } from "./Button";

export interface ModalOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface ModalController {
  element: HTMLDivElement;
  open: () => void;
  close: () => void;
  destroy: () => void;
}

const DEFAULT_END_SESSION_DESCRIPTION = [
  "確認ボタンを押すと患者に終了確認ウィンドウが表示されます。",
  "・資料の内容を網羅的に説明した",
  "・患者に質問は無いか確認した",
  "・患者は資料を十分に閲覧した",
].join("\n");

export function createModal(options: ModalOptions): ModalController {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";
  dialog.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const title = document.createElement("h2");
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 10)}`;
  title.className = "modal-title";
  title.id = titleId;
  title.textContent = options.title;

  const descriptionId = `modal-description-${Math.random().toString(36).slice(2, 10)}`;
  const descriptionWrap = document.createElement("div");
  descriptionWrap.className = "modal-description-wrap";
  descriptionWrap.id = descriptionId;

  const lines = options.description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const checklist = lines.filter((line) => line.startsWith("・"));
  const intro = lines.filter((line) => !line.startsWith("・"));

  for (const line of intro) {
    const paragraph = document.createElement("p");
    paragraph.className = "modal-description modal-description-centered";
    paragraph.textContent = line;
    descriptionWrap.append(paragraph);
  }

  if (checklist.length > 0) {
    const ul = document.createElement("ul");
    ul.className = "modal-checklist";
    for (const line of checklist) {
      const li = document.createElement("li");
      li.className = "modal-checklist-item";
      const normalized = line.replace(/^・/, "").trim();
      li.textContent = `・${normalized}`;
      ul.append(li);
    }
    descriptionWrap.append(ul);
  }

  overlay.setAttribute("aria-labelledby", titleId);
  overlay.setAttribute("aria-describedby", descriptionId);

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const cancelButton = createButton({
    label: options.cancelLabel ?? "キャンセル",
    variant: "secondary",
    className: "modal-cancel-button",
    onClick: () => {
      options.onCancel?.();
      close();
    },
  });

  const confirmButton = createButton({
    label: options.confirmLabel ?? "確認",
    variant: "primary",
    className: "modal-confirm-button",
    onClick: () => {
      options.onConfirm?.();
      close();
    },
  });

  actions.append(cancelButton, confirmButton);
  dialog.append(title, descriptionWrap, actions);
  overlay.append(dialog);

  let previouslyFocusedElement: HTMLElement | null = null;

  function open(): void {
    if (!overlay.isConnected) {
      document.body.append(overlay);
    }

    previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    overlay.hidden = false;
    document.body.classList.add("modal-open");
    confirmButton.focus();
  }

  function close(): void {
    overlay.hidden = true;
    document.body.classList.remove("modal-open");
    overlay.remove();
    previouslyFocusedElement?.focus();
  }

  function destroy(): void {
    close();
  }

  return {
    element: overlay,
    open,
    close,
    destroy,
  };
}

export function createEndSessionModal(options?: {
  onConfirm?: () => void;
  onCancel?: () => void;
}): ModalController {
  return createModal({
    title: "患者に終了の確認をしますか？",
    description: DEFAULT_END_SESSION_DESCRIPTION,
    confirmLabel: "確認",
    cancelLabel: "キャンセル",
    onConfirm: options?.onConfirm,
    onCancel: options?.onCancel,
  });
}
