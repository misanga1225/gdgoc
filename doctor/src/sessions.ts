/** ローカルストレージでセッションIDリストを管理 */
const STORAGE_KEY = "aurlum_sessions";

export function getSavedSessionIds(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function addSessionId(id: string): void {
  const ids = getSavedSessionIds();
  if (!ids.includes(id)) {
    ids.unshift(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }
}
