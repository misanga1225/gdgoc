export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "default" | "small";

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  block?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  onClick?: (event: MouseEvent) => void;
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = options.type ?? "button";
  button.textContent = options.label;
  button.disabled = options.disabled ?? false;
  button.className = createButtonClassName(options);
  button.dataset.variant = options.variant ?? "primary";
  button.dataset.size = options.size ?? "default";

  if (options.onClick) {
    button.addEventListener("click", options.onClick);
  }

  return button;
}

export function createButtonClassName(options: ButtonOptions): string {
  const classNames = ["btn"];

  classNames.push(
    options.variant === "secondary" ? "btn-secondary" : "btn-primary"
  );

  if (options.size === "small") {
    classNames.push("btn-sm");
  }

  if (options.block) {
    classNames.push("btn-block");
  }

  if (options.className) {
    classNames.push(options.className);
  }

  return classNames.join(" ");
}

export function setButtonDisabled(
  button: HTMLButtonElement,
  disabled: boolean
): void {
  button.disabled = disabled;
}
