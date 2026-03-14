/** 一時的なトースト通知を表示 */
export function showToast(
  message: string,
  type: "success" | "error" | "info" = "info",
  duration = 3000
): void {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, duration);
}
