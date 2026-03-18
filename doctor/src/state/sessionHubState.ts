export interface SessionFileItem {
  id: string;
  name: string;
  updatedAt: string;
  kind: string;
  size: string;
  sourceUrl?: string;
}

const sessionFilesMap = new Map<string, SessionFileItem[]>();

const MOCK_FILES: Omit<SessionFileItem, "id" | "sourceUrl">[] = [
  {
    name: "処方薬について",
    updatedAt: "2026/03/18 20:15",
    kind: "PDFファイル",
    size: "43MB",
  },
  {
    name: "家庭でのケアについて",
    updatedAt: "2026/03/16 20:15",
    kind: "Wordファイル",
    size: "29MB",
  },
  {
    name: "検査結果レポート",
    updatedAt: "2026/03/14 10:30",
    kind: "PDFファイル",
    size: "12MB",
  },
  {
    name: "リハビリ計画書",
    updatedAt: "2026/03/10 14:00",
    kind: "Excelファイル",
    size: "8MB",
  },
];

export function ensureSessionFiles(
  sessionId: string,
  sourceUrl?: string
): SessionFileItem[] {
  const existing = sessionFilesMap.get(sessionId);
  if (existing) {
    return existing;
  }

  const seeded = MOCK_FILES.map((item, index) => ({
    ...item,
    id: `${sessionId}-file-${index + 1}`,
    sourceUrl: index === 0 ? sourceUrl : undefined,
  }));

  sessionFilesMap.set(sessionId, seeded);
  return seeded;
}

export function deleteSessionFile(sessionId: string, fileId: string): void {
  const files = sessionFilesMap.get(sessionId);
  if (!files) {
    return;
  }

  const next = files.filter((file) => file.id !== fileId);
  sessionFilesMap.set(sessionId, next);
}
