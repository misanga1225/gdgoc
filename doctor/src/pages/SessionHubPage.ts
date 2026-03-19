import { getSession } from "../api";
import {
  renderDocumentAddPane,
} from "../components/session-hub/DocumentAddPane";
import { createFileDeleteConfirmModal } from "../components/session-hub/FileDeleteConfirmModal";
import {
  renderPatientSessionListPane,
  type PatientSessionRow,
  type SessionStatusLabel,
} from "../components/session-hub/PatientSessionListPane";
import { renderSessionFileTablePane } from "../components/session-hub/SessionFileTablePane";
import {
  clearSessionFilesCache,
  deleteSessionFile,
  ensureGroupFiles,
  type SessionFileItem,
} from "../state/sessionHubState";
import { getSavedSessionIds, removeSessionId } from "../sessions";
import { showToast } from "../toast";
import { buildPatientFullUrl } from "../api";
import { showPatientUrlDialog } from "../components/session-hub/PatientUrlDialog";

/** バックエンドから取得した1セッション分の情報 */
interface RawSessionRow {
  sessionId: string;
  name: string;
  chartId: string;
  statusLabel: SessionStatusLabel;
  sourceUrl?: string;
}

/** グループ化されたサイドバー行 */
interface SessionGroup extends PatientSessionRow {
  /** 各セッションの sourceUrl */
  sourceUrls: (string | undefined)[];
}

export interface OpenD03Payload {
  initialName: string;
  initialPatientId: string;
  selectedSessionId: string | null;
  selectedFileId: string | null;
}

export interface SessionHubPageOptions {
  loginUserId: string;
  initialSelectedGroupKey?: string | null;
  onOpenD05: (session: {
    sessionId: string;
    name: string;
    chartId: string;
    selectedFileId?: string | null;
    selectedFileName?: string;
  }) => void;
  onOpenD03: (payload: OpenD03Payload) => void;
  onLogout?: () => void;
}

const FALLBACK_GROUPS: SessionGroup[] = [
  {
    groupKey: "田中太郎|441255",
    name: "田中太郎",
    chartId: "441255",
    sessionIds: ["mock-session-1"],
    statusLabel: "未アクセス",
    sourceUrls: [undefined],
  },
  {
    groupKey: "山田聡|298465",
    name: "山田聡",
    chartId: "298465",
    sessionIds: ["mock-session-2"],
    statusLabel: "未アクセス",
    sourceUrls: [undefined],
  },
  {
    groupKey: "佐藤花子|553210",
    name: "佐藤花子",
    chartId: "553210",
    sessionIds: ["mock-session-3"],
    statusLabel: "未アクセス",
    sourceUrls: [undefined],
  },
];

export async function renderSessionHubPage(
  container: HTMLElement,
  options: SessionHubPageOptions
): Promise<void> {
  clearSessionFilesCache();
  const groups = await loadAndGroupSessions();
  let allGroups = groups.length > 0 ? groups : FALLBACK_GROUPS;
  let searchDraft = "";
  let searchQuery = "";
  const preferredGroupKey = options.initialSelectedGroupKey ?? null;
  let selectedGroupKey: string | null =
    preferredGroupKey && allGroups.some((g) => g.groupKey === preferredGroupKey)
      ? preferredGroupKey
      : (allGroups[0]?.groupKey ?? null);
  let selectedFileId: string | null = null;
  let deleteModal = null as ReturnType<typeof createFileDeleteConfirmModal> | null;

  function destroyDeleteModal(): void {
    deleteModal?.destroy();
    deleteModal = null;
  }

  function filteredGroups(): SessionGroup[] {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return allGroups;
    }
    return allGroups.filter((g) => {
      return (
        g.name.toLowerCase().includes(query) ||
        g.chartId.toLowerCase().includes(query)
      );
    });
  }

  function selectedGroup(): SessionGroup | null {
    if (!selectedGroupKey) {
      return null;
    }
    return allGroups.find((g) => g.groupKey === selectedGroupKey) ?? null;
  }

  function selectedFiles(): SessionFileItem[] {
    const group = selectedGroup();
    if (!group) {
      return [];
    }
    const sessions = group.sessionIds.map((sid, i) => ({
      sessionId: sid,
      sourceUrl: group.sourceUrls[i],
    }));
    return ensureGroupFiles(sessions);
  }

  function openSelectedFile(fileId: string): void {
    const group = selectedGroup();
    if (!group) {
      showToast("患者が選択されていません", "info");
      return;
    }
    const file = selectedFiles().find((item) => item.id === fileId);
    if (!file) return;
    options.onOpenD05({
      sessionId: file.sessionId,
      name: group.name,
      chartId: group.chartId,
      selectedFileId: fileId,
      selectedFileName: file.name,
    });
  }

  function showPatientUrlForFile(fileId: string): void {
    const file = selectedFiles().find((item) => item.id === fileId);
    if (!file) return;
    const patientPath = `/patient?session=${file.sessionId}`;
    showPatientUrlDialog(buildPatientFullUrl(patientPath), () => {});
  }

  function requestDelete(fileId: string): void {
    const group = selectedGroup();
    if (!group) return;
    const file = selectedFiles().find((item) => item.id === fileId);
    if (!file) return;

    destroyDeleteModal();
    deleteModal = createFileDeleteConfirmModal({
      fileName: file.name,
      onConfirm: () => {
        deleteSessionFile(file.sessionId, fileId);
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

  function openOriginalFile(fileId: string): void {
    const file = selectedFiles().find((item) => item.id === fileId);
    if (!file?.sourceUrl) {
      showToast("原本ファイルURLが見つかりません", "info");
      return;
    }
    window.open(file.sourceUrl, "_blank", "noopener,noreferrer");
  }

  function openD03(): void {
    const group = selectedGroup();
    options.onOpenD03({
      initialName: group?.name ?? "",
      initialPatientId: group?.chartId ?? "",
      // 常に新セッション作成（既存セッションを上書きしない）
      selectedSessionId: null,
      selectedFileId: null,
    });
  }

  function render(): void {
    destroyDeleteModal();
    container.innerHTML = "";
    container.className = "d02-page";

    const layout = document.createElement("section");
    layout.className = "d02-layout";

    const groupsToDisplay = filteredGroups();
    if (selectedGroupKey && !groupsToDisplay.some((g) => g.groupKey === selectedGroupKey)) {
      selectedGroupKey = null;
      selectedFileId = null;
    }

    const group = selectedGroup();
    const files = selectedFiles();
    if (selectedFileId && !files.some((file) => file.id === selectedFileId)) {
      selectedFileId = null;
    }

    const leftPane = renderPatientSessionListPane({
      rows: groupsToDisplay,
      selectedGroupKey,
      loginLabel: `ログイン: ${options.loginUserId}`,
      onLogout: options.onLogout,
      searchDraft,
      onSearchDraftChange: (next) => {
        searchDraft = next;
      },
      onSearchSubmit: (next) => {
        searchDraft = next;
        searchQuery = next;
        selectedGroupKey = null;
        selectedFileId = null;
        render();
      },
      onClearSelection: () => {
        selectedGroupKey = null;
        selectedFileId = null;
        render();
      },
      onSelect: (groupKey) => {
        selectedGroupKey = groupKey;
        selectedFileId = null;
        render();
      },
      onDelete: (groupKey) => {
        const target = allGroups.find((g) => g.groupKey === groupKey);
        if (!target) return;
        if (!confirm("この患者の全セッションを削除しますか？")) return;
        for (const sid of target.sessionIds) {
          removeSessionId(sid);
        }
        allGroups = allGroups.filter((g) => g.groupKey !== groupKey);
        if (selectedGroupKey === groupKey) {
          selectedGroupKey = allGroups[0]?.groupKey ?? null;
          selectedFileId = null;
        }
        render();
        showToast("セッションを削除しました", "success");
      },
    });

    const centerPane = renderSessionFileTablePane({
      sessionName: group?.name ?? "患者未選択",
      sessionChartId: group?.chartId ?? "-",
      files,
      selectedFileId,
      onSelectFile: (fileId) => {
        selectedFileId = fileId;
        render();
      },
      onOpenFile: openSelectedFile,
      onOpenOriginalFile: openOriginalFile,
      onRequestDelete: requestDelete,
      onShowPatientUrl: selectedFileId
        ? () => showPatientUrlForFile(selectedFileId!)
        : undefined,
    });

    const rightPane = renderDocumentAddPane({
      onAddClick: openD03,
    });

    layout.append(leftPane, centerPane, rightPane);
    container.append(layout);
  }

  render();
}

/** セッション一覧を取得し、(name, chartId) でグループ化する */
async function loadAndGroupSessions(): Promise<SessionGroup[]> {
  const ids = getSavedSessionIds();
  if (ids.length === 0) {
    return [];
  }

  // 全セッション情報を並列取得
  const rawRows = await Promise.all(
    ids.map(async (id): Promise<RawSessionRow> => {
      try {
        const session = await getSession(id);
        return {
          sessionId: id,
          name: String(session.name ?? "患者"),
          chartId: String(session.patient_id ?? session.patientId ?? id.slice(0, 8)),
          statusLabel: toStatusLabel(String(session.status ?? "waiting")),
          sourceUrl: String(session.document_url ?? ""),
        };
      } catch {
        return {
          sessionId: id,
          name: "患者",
          chartId: id.slice(0, 8),
          statusLabel: "未アクセス",
        };
      }
    })
  );

  // (name, chartId) でグループ化
  const groupMap = new Map<string, SessionGroup>();
  for (const row of rawRows) {
    const key = `${row.name}|${row.chartId}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.sessionIds.push(row.sessionId);
      existing.sourceUrls.push(row.sourceUrl);
      // ステータスは最も進んだものを採用
      existing.statusLabel = mergeStatus(existing.statusLabel, row.statusLabel);
    } else {
      groupMap.set(key, {
        groupKey: key,
        name: row.name,
        chartId: row.chartId,
        sessionIds: [row.sessionId],
        statusLabel: row.statusLabel,
        sourceUrls: [row.sourceUrl],
      });
    }
  }

  return Array.from(groupMap.values());
}

/** ステータスの優先度順にマージ（最も進んだステータスを返す） */
function mergeStatus(a: SessionStatusLabel, b: SessionStatusLabel): SessionStatusLabel {
  const order: SessionStatusLabel[] = ["未アクセス", "閲覧中", "確認待ち", "同意許可済", "完了"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function toStatusLabel(status: string): SessionStatusLabel {
  switch (status) {
    case "watching":
      return "閲覧中";
    case "reviewed":
      return "確認待ち";
    case "authorized":
      return "同意許可済";
    case "completed":
      return "完了";
    default:
      return "未アクセス";
  }
}
