import { createEndSessionModal, type ModalController } from "../../../shared/components/Modal";
import { collection, doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getSession, summarizeMissed, updateSessionStatus } from "../api";
import { renderBottomActionBar } from "../components/doctor-main/BottomActionBar";
import {
  renderHtmlDocumentViewer,
  type HtmlDocumentViewerMarker,
} from "../components/doctor-main/HtmlDocumentViewer";
import { renderTopHeader } from "../components/doctor-main/TopHeader";
import {
  renderViewingStatusPanel,
  type UnviewedSectionItem,
} from "../components/doctor-main/ViewingStatusPanel";
import { db } from "../firebase";
import {
  closeEndSessionModal,
  createInitialDoctorMainState,
  markViewingStatusAsUpdated,
  openEndSessionModal,
  type DoctorMainState,
} from "../state/doctorMainState";
import { showToast } from "../toast";

export interface DoctorMainPageOptions {
  onBackToD02?: () => void;
  sessionId: string;
  patientName?: string;
  patientChartId?: string;
  selectedFileId?: string | null;
  selectedFileName?: string;
}

const DWELL_THRESHOLD = 3;

interface GazeData {
  paragraph_id: string;
  dwell_time: number;
  is_reached: boolean;
  last_updated?: string;
}

interface DocParagraph {
  id: string;
  text: string;
}

export function renderDoctorMainPage(
  container: HTMLElement,
  options?: DoctorMainPageOptions
): void {
  let state = createInitialDoctorMainState();
  let modal: ModalController | null = null;
  let currentTimeLabel = formatCurrentTime();
  const host = container as HTMLElement & {
    __d05ClockIntervalId?: number;
    __d05UnsubGaze?: Unsubscribe;
    __d05UnsubSession?: Unsubscribe;
  };

  if (!options?.sessionId) {
    container.innerHTML = `<div style="padding:24px;">セッションIDが指定されていません。</div>`;
    return;
  }
  const sessionId = options.sessionId;

  if (host.__d05ClockIntervalId) {
    clearInterval(host.__d05ClockIntervalId);
  }

  host.__d05UnsubGaze?.();
  host.__d05UnsubSession?.();

  host.__d05ClockIntervalId = window.setInterval(() => {
    const timeLabel = container.querySelector<HTMLElement>(".d05-current-time");
    if (!timeLabel) {
      if (host.__d05ClockIntervalId) {
        clearInterval(host.__d05ClockIntervalId);
        host.__d05ClockIntervalId = undefined;
      }
      return;
    }

    currentTimeLabel = formatCurrentTime();
    timeLabel.textContent = currentTimeLabel;
  }, 60_000);

  let patientName = options?.patientName ?? "患者";
  let patientChartId = options?.patientChartId ?? "—";
  let patientViewStatusLabel: "閲覧中" | "不在" = "不在";
  let documentTitle = "説明資料";
  let documentHtml = "<p>文書がまだアップロードされていません。</p>";
  let attentionMarkers: HtmlDocumentViewerMarker[] = [];
  let unviewedSections: UnviewedSectionItem[] = [];
  let elapsedTimeLabel = "-";
  let progressPercent = 0;
  let isUpdating = false;
  let sessionCreatedAt: string | null = null;
  let sessionStatus = "waiting";
  let docParagraphs: DocParagraph[] = [];
  const gazeMap = new Map<string, GazeData>();
  /** 一度でもOK判定（dwell_time >= 閾値）になった段落IDを記録。以降の更新で見落としに戻さない */
  const confirmedOkParagraphs = new Set<string>();

  function destroyModal(): void {
    modal?.destroy();
    modal = null;
  }

  function openModal(): void {
    destroyModal();
    modal = createEndSessionModal({
      onConfirm: async () => {
        try {
          await updateSessionStatus(sessionId, "authorized");
          showToast("最終同意を患者側に反映しました。", "success");
        } catch (error) {
          showToast(`反映に失敗しました: ${error}`, "error");
        } finally {
          state = closeEndSessionModal(state);
          render();
        }
      },
      onCancel: () => {
        state = closeEndSessionModal(state);
        render();
      },
    });
    modal.open();
  }

  async function handleUpdateClick(): Promise<void> {
    if (isUpdating || sessionStatus === "completed") {
      if (sessionStatus === "completed") {
        showToast("同意完了後は更新できません。", "info");
      }
      return;
    }
    isUpdating = true;
    render();

    // OK判定の段落を記録（一度OKになったら戻さない）
    for (const paragraph of docParagraphs) {
      const gaze = gazeMap.get(paragraph.id);
      if (gaze && gaze.is_reached && gaze.dwell_time >= DWELL_THRESHOLD) {
        confirmedOkParagraphs.add(paragraph.id);
      }
    }

    const missed = buildMissedParagraphs(docParagraphs, gazeMap, confirmedOkParagraphs);
    progressPercent = calculateProgress(docParagraphs, gazeMap, confirmedOkParagraphs);
    elapsedTimeLabel = formatElapsedTime(sessionCreatedAt);
    console.log("[D05] update: paragraphs:", docParagraphs.length,
      "gazeMap:", gazeMap.size, "missed:", missed.length, "confirmedOk:", confirmedOkParagraphs.size,
      "progress:", progressPercent);

    if (missed.length === 0) {
      attentionMarkers = [];
      unviewedSections = [];
      state = markViewingStatusAsUpdated(state);
      isUpdating = false;
      render();
      return;
    }

    try {
      const { summary } = await summarizeMissed(sessionId, missed);
      const lines = parseSummaryLines(summary);
      unviewedSections = lines.map((title, index) => ({
        id: `summary-${index + 1}`,
        title,
        sectionId: missed[index]?.id ?? `summary-${index + 1}`,
      }));
    } catch (error) {
      showToast(`要約取得に失敗しました: ${error}`, "error");
      unviewedSections = missed.map((item, index) => ({
        id: `missed-${index + 1}`,
        title: `${item.id}: ${item.text.slice(0, 60)}`,
        sectionId: item.id,
      }));
    }

    attentionMarkers = missed.map((item, index) => ({
      id: `missed-marker-${index + 1}`,
      sectionId: item.id,
    }));

    state = markViewingStatusAsUpdated(state);
    isUpdating = false;
    render();
  }

  function handleEndSessionClick(): void {
    if (sessionStatus === "completed") {
      showToast("同意完了後は操作できません。", "info");
      return;
    }
    state = openEndSessionModal(state);
    render();
  }

  function renderMainContent(currentState: DoctorMainState): HTMLElement {
    const main = document.createElement("main");
    main.className = "d05-main";

    const viewer = renderHtmlDocumentViewer({
      documentTitle,
      documentHtml,
      attentionMarkers,
      showAttentionMarkers: currentState.hasFetchedResult,
    });

    const panel = renderViewingStatusPanel({
      hasFetchedResult: currentState.hasFetchedResult,
      elapsedTimeLabel,
      progressPercent,
      unviewedSections,
      emptyResultLabel: "見落としはありません。",
    });

    main.append(viewer, panel);
    return main;
  }

  function render(): void {
    const scrollTop =
      container.querySelector<HTMLElement>(".d05-document-viewport")?.scrollTop ??
      0;

    container.innerHTML = "";

    const page = document.createElement("section");
    page.className = "d05-page";

    const header = renderTopHeader({
      patientName,
      patientChartId,
      currentTimeLabel,
      patientViewStatusLabel,
      onBackToD02: options?.onBackToD02,
    });

    const actionBar = renderBottomActionBar({
      isUpdating: isUpdating || sessionStatus === "completed",
      onUpdateClick: () => {
        void handleUpdateClick();
      },
      onEndSessionClick: handleEndSessionClick,
    });

    page.append(header, renderMainContent(state), actionBar);
    container.append(page);

    const viewport = container.querySelector<HTMLElement>(".d05-document-viewport");
    if (viewport) {
      viewport.scrollTop = scrollTop;
    }

    if (state.isEndSessionModalOpen) {
      openModal();
    } else {
      destroyModal();
    }
  }

  void initializeSession();
  subscribeRealtime();
  render();

  async function initializeSession(): Promise<void> {
    try {
      const session = await getSession(sessionId);
      patientName = String(session.name ?? patientName);
      patientChartId = String(session.patient_id ?? session.patientId ?? patientChartId);
      // 経過時間は患者の閲覧開始時刻(watching_since)を使う。未閲覧ならセッション作成時刻
      sessionCreatedAt = session.watching_since
        ? String(session.watching_since)
        : session.created_at
          ? String(session.created_at)
          : null;
      const status = String(session.status ?? "");
      sessionStatus = status || "waiting";
      patientViewStatusLabel = sessionStatus === "watching" ? "閲覧中" : "不在";

      const documentUrl = String(session.document_url ?? "");
      if (documentUrl) {
        try {
          const resp = await fetch(documentUrl);
          if (resp.ok) {
            documentHtml = await resp.text();
          }
        } catch {
          documentHtml = "<p>文書の読み込みに失敗しました。</p>";
        }
      }

      documentTitle = extractDocumentTitle(documentHtml);
      docParagraphs = extractParagraphs(documentHtml);
      render();
    } catch (error) {
      showToast(`セッション取得に失敗しました: ${error}`, "error");
      render();
    }
  }

  function subscribeRealtime(): void {
    const sessionRef = doc(db, "Patients", sessionId);
    host.__d05UnsubSession = onSnapshot(sessionRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      const status = String(data.status ?? "");
      const prevStatus = sessionStatus;
      sessionStatus = status || "waiting";
      patientViewStatusLabel = sessionStatus === "watching" ? "閲覧中" : "不在";
      console.log("[D05] session status changed:", status, "→", patientViewStatusLabel);
      const statusEl = container.querySelector<HTMLElement>(".d05-view-status");
      if (statusEl) {
        statusEl.textContent = patientViewStatusLabel;
        statusEl.className = status === "watching"
          ? "d05-view-status is-viewing"
          : "d05-view-status is-away";
      }
      if (sessionStatus === "completed" && prevStatus !== "completed") {
        showToast("患者が最終同意を完了しました。", "success");
        options?.onBackToD02?.();
        return;
      }
    });

    const gazeRef = collection(db, "Patients", sessionId, "LiveGaze");
    host.__d05UnsubGaze = onSnapshot(gazeRef, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const data = change.doc.data() as GazeData;
        if (!data?.paragraph_id) continue;
        if (change.type === "removed") {
          gazeMap.delete(data.paragraph_id);
        } else {
          gazeMap.set(data.paragraph_id, data);
        }
      }
      console.log("[D05] gazeMap updated, entries:", gazeMap.size,
        "sample:", gazeMap.size > 0 ? JSON.stringify([...gazeMap.values()].slice(0, 2)) : "none");
    });
  }
}

function formatCurrentTime(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatElapsedTime(createdAt: string | null): string {
  if (!createdAt) {
    return "-";
  }
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return "-";
  }
  const diffMs = Date.now() - created.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 1000 / 60));
  return `${minutes}分`;
}

function extractDocumentTitle(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const heading = doc.querySelector("h1, h2, h3");
  return heading?.textContent?.trim() || "説明資料";
}

function extractParagraphs(html: string): DocParagraph[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll<HTMLElement>("[data-paragraph-id]"))
    .map((el) => {
      const id = el.dataset.paragraphId ?? "";
      return { id, text: (el.textContent ?? "").trim() };
    })
    .filter((item) => item.id && item.text);
}

function buildMissedParagraphs(
  paragraphs: DocParagraph[],
  gazeMap: Map<string, GazeData>,
  confirmedOk: Set<string>
): { id: string; text: string; dwell_time: number }[] {
  const missed: { id: string; text: string; dwell_time: number }[] = [];
  for (const paragraph of paragraphs) {
    if (confirmedOk.has(paragraph.id)) {
      continue;
    }
    const gaze = gazeMap.get(paragraph.id);
    if (!gaze || !gaze.is_reached) {
      continue;
    }
    if (gaze.dwell_time < DWELL_THRESHOLD) {
      missed.push({
        id: paragraph.id,
        text: paragraph.text,
        dwell_time: gaze.dwell_time,
      });
    }
  }
  return missed;
}

function calculateProgress(
  paragraphs: DocParagraph[],
  gazeMap: Map<string, GazeData>,
  confirmedOk: Set<string>
): number {
  if (paragraphs.length === 0) {
    return 0;
  }
  let okCount = 0;
  for (const paragraph of paragraphs) {
    if (confirmedOk.has(paragraph.id)) {
      okCount += 1;
      continue;
    }
    const gaze = gazeMap.get(paragraph.id);
    if (gaze && gaze.is_reached && gaze.dwell_time >= DWELL_THRESHOLD) {
      okCount += 1;
    }
  }
  return Math.round((okCount / paragraphs.length) * 100);
}

/**
 * Gemini応答から「各段落の内容要約」セクションを行単位で抽出する。
 * 段落IDを含む行だけを取り出し、各見落とし箇所の要約として返す。
 */
function parseSummaryLines(summary: string): string[] {
  const lines = summary.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // 「各段落の内容要約」セクション以降の行を抽出
  const sectionIdx = lines.findIndex((l) => l.includes("各段落の内容要約"));
  const targetLines = sectionIdx >= 0 ? lines.slice(sectionIdx + 1) : lines;

  // 段落IDパターン (p-0, p-1, ...) を含む行を要約行とみなす
  const paragraphLines = targetLines.filter((l) => /p-\d+/.test(l));
  if (paragraphLines.length > 0) {
    return paragraphLines;
  }

  // パターンにマッチしなければ、概要セクション以外の全行を返す
  return targetLines;
}
