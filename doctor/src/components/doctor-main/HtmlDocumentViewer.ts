import { renderAttentionCornerMarker } from "./AttentionCornerMarker";

export interface HtmlDocumentViewerMarker {
  id: string;
  sectionId: string;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
}

export interface HtmlDocumentViewerOptions {
  documentTitle: string;
  documentHtml: string;
  attentionMarkers: HtmlDocumentViewerMarker[];
  showAttentionMarkers: boolean;
}

export function renderHtmlDocumentViewer(
  options: HtmlDocumentViewerOptions
): HTMLElement {
  const root = document.createElement("section");
  root.className = "d05-document-viewer";

  const title = document.createElement("h2");
  title.className = "d05-document-title";
  title.textContent = options.documentTitle;

  const viewport = document.createElement("div");
  viewport.className = "d05-document-viewport";

  const content = document.createElement("div");
  content.className = "d05-document-content";
  content.innerHTML = options.documentHtml;

  const contentWrap = document.createElement("div");
  contentWrap.className = "d05-document-content-wrap";

  const overlayLayer = document.createElement("div");
  overlayLayer.className = "d05-attention-overlay-layer";

  contentWrap.append(content, overlayLayer);
  viewport.append(contentWrap);

  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

  const syncMarkers = () => {
    overlayLayer.innerHTML = "";

    if (!options.showAttentionMarkers) {
      return;
    }

    for (const marker of options.attentionMarkers) {
      const target = content.querySelector<HTMLElement>(`#${marker.sectionId}`);
      if (!target) {
        continue;
      }

      const top = clamp(target.offsetTop, 0, contentWrap.clientHeight);
      const left = clamp(target.offsetLeft, 0, contentWrap.clientWidth);
      const width = clamp(
        target.offsetWidth,
        0,
        Math.max(0, contentWrap.clientWidth - left)
      );
      const height = clamp(
        target.offsetHeight,
        0,
        Math.max(0, contentWrap.clientHeight - top)
      );

      if (width <= 0 || height <= 0) {
        continue;
      }

      const markerEl = renderAttentionCornerMarker({
        top,
        left,
        width,
        height,
      });
      markerEl.id = marker.id;
      markerEl.dataset.sectionId = marker.sectionId;
      overlayLayer.append(markerEl);
    }
  };

  root.append(title, viewport);

  // Recompute marker boxes whenever layout can change.
  const recalc = () => syncMarkers();
  viewport.addEventListener("scroll", recalc);

  if ("ResizeObserver" in globalThis) {
    const observer = new ResizeObserver(() => syncMarkers());
    observer.observe(content);
    observer.observe(viewport);
  }

  requestAnimationFrame(syncMarkers);

  return root;
}
