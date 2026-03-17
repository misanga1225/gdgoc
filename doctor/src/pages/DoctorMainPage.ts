import { createEndSessionModal, type ModalController } from "../../../shared/components/Modal";
import { renderBottomActionBar } from "../components/doctor-main/BottomActionBar";
import { renderHtmlDocumentViewer } from "../components/doctor-main/HtmlDocumentViewer";
import { renderTopHeader } from "../components/doctor-main/TopHeader";
import { renderViewingStatusPanel } from "../components/doctor-main/ViewingStatusPanel";
import { doctorMainMockData } from "../mocks/doctorMainMock";
import { SAMPLE_DOCUMENT_HTML, SAMPLE_DOCUMENT_TITLE } from "../mocks/sampleDocumentHtml";
import {
  closeEndSessionModal,
  createInitialDoctorMainState,
  markViewingStatusAsUpdated,
  openEndSessionModal,
  type DoctorMainState,
} from "../state/doctorMainState";

export function renderDoctorMainPage(container: HTMLElement): void {
  let state = createInitialDoctorMainState();
  let modal: ModalController | null = null;
  let currentTimeLabel = formatCurrentTime();
  const host = container as HTMLElement & { __d05ClockIntervalId?: number };

  if (host.__d05ClockIntervalId) {
    clearInterval(host.__d05ClockIntervalId);
  }

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

  function destroyModal(): void {
    modal?.destroy();
    modal = null;
  }

  function openModal(): void {
    destroyModal();
    modal = createEndSessionModal({
      onConfirm: () => {
        state = closeEndSessionModal(state);
        render();
      },
      onCancel: () => {
        state = closeEndSessionModal(state);
        render();
      },
    });
    modal.open();
  }

  function handleUpdateClick(): void {
    state = markViewingStatusAsUpdated(state);
    render();
  }

  function handleEndSessionClick(): void {
    state = openEndSessionModal(state);
    render();
  }

  function renderMainContent(currentState: DoctorMainState): HTMLElement {
    const main = document.createElement("main");
    main.className = "d05-main";

    const viewer = renderHtmlDocumentViewer({
      documentTitle: SAMPLE_DOCUMENT_TITLE,
      documentHtml: SAMPLE_DOCUMENT_HTML,
      attentionMarkers: doctorMainMockData.attentionMarkers,
      showAttentionMarkers: currentState.hasFetchedResult,
    });

    const panel = renderViewingStatusPanel({
      hasFetchedResult: currentState.hasFetchedResult,
      elapsedTimeLabel: doctorMainMockData.elapsedTimeLabel,
      progressPercent: doctorMainMockData.progressPercent,
      unviewedSections: doctorMainMockData.unviewedSections,
    });

    main.append(viewer, panel);
    return main;
  }

  function render(): void {
    container.innerHTML = "";

    const page = document.createElement("section");
    page.className = "d05-page";

    const header = renderTopHeader({
      patientName: doctorMainMockData.patientName,
      patientChartId: doctorMainMockData.patientChartId,
      currentTimeLabel,
      patientViewStatusLabel:
        doctorMainMockData.patientViewStatusLabel as "閲覧中" | "不在",
    });

    const actionBar = renderBottomActionBar({
      isUpdating: false,
      onUpdateClick: handleUpdateClick,
      onEndSessionClick: handleEndSessionClick,
    });

    page.append(header, renderMainContent(state), actionBar);
    container.append(page);

    if (state.isEndSessionModalOpen) {
      openModal();
    } else {
      destroyModal();
    }
  }

  render();
}

function formatCurrentTime(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
