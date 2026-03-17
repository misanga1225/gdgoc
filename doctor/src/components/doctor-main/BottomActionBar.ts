import { createButton } from "../../../../shared/components/Button";

export interface BottomActionBarOptions {
  isUpdating: boolean;
  onUpdateClick: () => void;
  onEndSessionClick: () => void;
}

export function renderBottomActionBar(
  options: BottomActionBarOptions
): HTMLElement {
  const bar = document.createElement("footer");
  bar.className = "d05-bottom-action-bar";

  const left = document.createElement("div");
  left.className = "d05-action-left";

  const right = document.createElement("div");
  right.className = "d05-action-right";

  const endButton = createButton({
    label: "説明終了の同意確認へ",
    variant: "secondary",
    disabled: options.isUpdating,
    onClick: () => {
      options.onEndSessionClick();
    },
  });

  const updateButton = createButton({
    label: "閲覧状況を更新",
    variant: "primary",
    disabled: options.isUpdating,
    onClick: () => {
      options.onUpdateClick();
    },
  });

  left.append(endButton);
  right.append(updateButton);
  bar.append(left, right);

  return bar;
}
