import { getSession } from "../api";
import {
  renderDocumentAddPane,
} from "../components/session-hub/DocumentAddPane";
import { createFileDeleteConfirmModal } from "../components/session-hub/FileDeleteConfirmModal";
import {
  renderPatientSessionListPane,
  type PatientSessionRow,
} from "../components/session-hub/PatientSessionListPane";
import { renderSessionFileTablePane } from "../components/session-hub/SessionFileTablePane";
import {
  deleteSessionFile,
  ensureSessionFiles,
  type SessionFileItem,
} from "../state/sessionHubState";
import { getSavedSessionIds } from "../sessions";
import { showToast } from "../toast";

interface SessionHubRow extends PatientSessionRow {
  sourceUrl?: string;
}

export interface OpenD03Payload {
  initialName: string;
  initialPatientId: string;
  selectedSessionId: string | null;
  selectedFileId: string | null;
  selectedFileName?: string;
}

export interface SessionHubPageOptions {
  loginUserId: string;
  onOpenD05: (session: { sessionId: string; name: string; chartId: string }) => void;
  onOpenD03: (payload: OpenD03Payload) => void;
}

const FALLBACK_ROWS: SessionHubRow[] = [
  {
    id: "mock-session-1",
    name: "田中太郎",
    chartId: "441255",
    statusLabel: "閲覧中",
  },
  {
    id: "mock-session-2",
    name: "山田聡",
    chartId: "298465",
    statusLabel: "不在",
  },
  {
    id: "mock-session-3",
    name: "佐藤花子",
    chartId: "553210",
    statusLabel: "閲覧中",
  },
  {
    id: "mock-session-4",
    name: "鈴木一郎",
    chartId: "178923",
    statusLabel: "不在",
  },
  {
    id: "mock-session-5",
    name: "高橋美咲",
    chartId: "662847",
    statusLabel: "閲覧中",
  },
];

export async function renderSessionHubPage(
  container: HTMLElement,
  options: SessionHubPageOptions
): Promise<void> {
  const rows = await loadSessionRows();
  let allRows = rows.length > 0 ? rows : FALLBACK_ROWS;
  let searchDraft = "";
  let searchQuery = "";
  let selectedSessionId: string | null = allRows[0]?.id ?? null;
  let selectedFileId: string | null = null;
  let deleteModal = null as ReturnType<typeof createFileDeleteConfirmModal> | null;

  function destroyDeleteModal(): void {
    deleteModal?.destroy();
    deleteModal = null;
  }

  function filteredRows(): SessionHubRow[] {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return allRows;
    }
    return allRows.filter((row) => {
      return (
        row.name.toLowerCase().includes(query) ||
        row.chartId.toLowerCase().includes(query)
      );
    });
  }

  function selectedRow(): SessionHubRow | null {
    if (!selectedSessionId) {
      return null;
    }
    return allRows.find((row) => row.id === selectedSessionId) ?? null;
  }

  function selectedFiles(): SessionFileItem[] {
    const row = selectedRow();
    if (!row) {
      return [];
    }
    return ensureSessionFiles(row.id, row.sourceUrl);
  }

  function openSelectedFile(fileId: string): void {
    const file = selectedFiles().find((item) => item.id === fileId);
    if (!file?.sourceUrl) {
      showToast("この資料はプレビューURLが未設定です", "info");
      return;
    }
    window.open(file.sourceUrl, "_blank", "noopener,noreferrer");
  }

  function requestDelete(fileId: string): void {
    const row = selectedRow();
    if (!row) {
      return;
    }
    const file = selectedFiles().find((item) => item.id === fileId);
    if (!file) {
      return;
    }

    destroyDeleteModal();
    deleteModal = createFileDeleteConfirmModal({
      fileName: file.name,
      onConfirm: () => {
        deleteSessionFile(row.id, fileId);
        const nextFiles = selectedFiles();
        selectedFileId = nextFiles[0]?.id ?? null;
        render();
        showToast("資料を削除しました", "success");
      },
      onCancel: () => {
        destroyDeleteModal();
      },
    });
    deleteModal.open();
  }

  function openD03(): void {
    const row = selectedRow();
    if (row) {
      const selectedFileName =
        selectedFiles().find((file) => file.id === selectedFileId)?.name ??
        undefined;
      options.onOpenD03({
        initialName: row.name,
        initialPatientId: row.chartId,
        selectedSessionId: row.id,
        selectedFileId,
        selectedFileName,
      });
      return;
    }

    options.onOpenD03({
      initialName: "",
      initialPatientId: "",
      selectedSessionId: null,
      selectedFileId: null,
      selectedFileName: undefined,
    });
  }

  function render(): void {
    destroyDeleteModal();
    container.innerHTML = "";
    container.className = "d02-page";

    const layout = document.createElement("section");
    layout.className = "d02-layout";

    const rowsToDisplay = filteredRows();
    if (selectedSessionId && !rowsToDisplay.some((row) => row.id === selectedSessionId)) {
      selectedSessionId = null;
      selectedFileId = null;
    }

    const row = selectedRow();
    const files = selectedFiles();
    if (selectedFileId && !files.some((file) => file.id === selectedFileId)) {
      selectedFileId = null;
    }

    const leftPane = renderPatientSessionListPane({
      rows: rowsToDisplay,
      selectedId: selectedSessionId,
      loginLabel: `ログイン: ${options.loginUserId}`,
      searchDraft,
      onSearchDraftChange: (next) => {
        searchDraft = next;
      },
      onSearchSubmit: (next) => {
        searchDraft = next;
        searchQuery = next;
        selectedSessionId = null;
        selectedFileId = null;
        render();
      },
      onClearSelection: () => {
        selectedSessionId = null;
        selectedFileId = null;
        render();
      },
      onSelect: (id) => {
        selectedSessionId = id;
        selectedFileId = null;
        render();
      },
      onOpenD05: (id) => {
        const target = allRows.find((item) => item.id === id);
        if (!target) {
          return;
        }
        options.onOpenD05({
          sessionId: target.id,
          name: target.name,
          chartId: target.chartId,
        });
      },
    });

    const centerPane = renderSessionFileTablePane({
      sessionName: row?.name ?? "患者未選択",
      sessionChartId: row?.chartId ?? "-",
      files,
      selectedFileId,
      onSelectFile: (fileId) => {
        selectedFileId = fileId;
        render();
      },
      onOpenFile: openSelectedFile,
      onRequestDelete: requestDelete,
    });

    const rightPane = renderDocumentAddPane({
      onAddClick: openD03,
    });

    layout.append(leftPane, centerPane, rightPane);
    container.append(layout);
  }

  render();
}

async function loadSessionRows(): Promise<SessionHubRow[]> {
  const ids = getSavedSessionIds();
  if (ids.length === 0) {
    return [];
  }

  const tasks = ids.map(async (id): Promise<SessionHubRow> => {
    try {
      const session = await getSession(id);
      return {
        id,
        name: String(session.name ?? "患者"),
        chartId: String(session.patient_id ?? session.patientId ?? id.slice(0, 8)),
        statusLabel:
          String(session.status ?? "waiting") === "watching" ? "閲覧中" : "不在",
        sourceUrl: String(session.document_url ?? ""),
      };
    } catch {
      return {
        id,
        name: "患者",
        chartId: id.slice(0, 8),
        statusLabel: "不在",
      };
    }
  });

  return Promise.all(tasks);
}
