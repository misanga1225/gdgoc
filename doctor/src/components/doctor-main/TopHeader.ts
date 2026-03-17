export interface TopHeaderOptions {
  patientName: string;
  patientChartId: string;
  currentTimeLabel: string;
  patientViewStatusLabel: "閲覧中" | "不在";
}

export function renderTopHeader(options: TopHeaderOptions): HTMLElement {
  const header = document.createElement("header");
  header.className = "d05-top-header";

  const brand = document.createElement("div");
  brand.className = "d05-brand";
  brand.textContent = "Aurlum";

  const patientMeta = document.createElement("div");
  patientMeta.className = "d05-patient-meta";

  const name = document.createElement("div");
  name.className = "d05-patient-name";
  name.textContent = options.patientName;

  const chartId = document.createElement("div");
  chartId.className = "d05-patient-chart-id";
  chartId.textContent = `カルテID: ${options.patientChartId}`;

  const time = document.createElement("div");
  time.className = "d05-current-time";
  time.textContent = options.currentTimeLabel;

  const status = document.createElement("span");
  status.className =
    options.patientViewStatusLabel === "不在"
      ? "d05-view-status is-away"
      : "d05-view-status is-viewing";
  status.textContent = options.patientViewStatusLabel;

  patientMeta.append(name, chartId, time, status);
  header.append(brand, patientMeta);

  return header;
}
