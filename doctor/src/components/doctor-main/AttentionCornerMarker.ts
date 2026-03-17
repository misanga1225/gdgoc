export interface AttentionCornerMarkerOptions {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function renderAttentionCornerMarker(
  options: AttentionCornerMarkerOptions
): HTMLElement {
  const marker = document.createElement("div");
  marker.className = "d05-attention-marker";
  marker.style.top = `${options.top}px`;
  marker.style.left = `${options.left}px`;
  marker.style.width = `${options.width}px`;
  marker.style.height = `${options.height}px`;

  for (const corner of ["tl", "tr", "bl", "br"]) {
    const el = document.createElement("span");
    el.className = `d05-attention-corner d05-attention-corner-${corner}`;
    marker.append(el);
  }

  return marker;
}
