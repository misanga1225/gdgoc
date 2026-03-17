export interface ProgressBarOptions {
  percent: number;
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

export function renderProgressBar(options: ProgressBarOptions): HTMLElement {
  const percent = clampPercent(options.percent);

  const root = document.createElement("div");
  root.className = "d05-progress";

  const label = document.createElement("div");
  label.className = "d05-progress-label";
  label.textContent = `${percent}%`;

  const track = document.createElement("div");
  track.className = "d05-progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(percent));

  const fill = document.createElement("div");
  fill.className = "d05-progress-fill";
  fill.style.width = `${percent}%`;

  track.append(fill);
  root.append(track, label);

  return root;
}
