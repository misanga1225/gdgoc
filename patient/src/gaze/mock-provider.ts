import type { GazeProvider, ParagraphGaze } from "./types";

const SYNC_INTERVAL_MS = 2500;
const TICK_INTERVAL_MS = 1000;

/**
 * モック視線プロバイダー
 * IntersectionObserverでビューポート内の段落を検知し、
 * 滞在時間を1秒ごとに加算する。2.5秒間隔でコールバックを発火。
 */
export class MockGazeProvider implements GazeProvider {
  private observer: IntersectionObserver | null = null;
  private tickTimer: number | null = null;
  private syncTimer: number | null = null;
  private callback: ((data: ParagraphGaze[]) => void) | null = null;

  /** 段落IDごとの視線データ */
  private gazeMap = new Map<
    string,
    { dwellTime: number; isReached: boolean; isVisible: boolean }
  >();

  onUpdate(callback: (data: ParagraphGaze[]) => void): void {
    this.callback = callback;
  }

  start(paragraphs: HTMLElement[]): void {
    // 初期化
    for (const el of paragraphs) {
      const id = el.dataset.paragraphId;
      if (id) {
        this.gazeMap.set(id, { dwellTime: 0, isReached: false, isVisible: false });
      }
    }

    // ビューポート検知
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.paragraphId;
          if (!id) continue;
          const data = this.gazeMap.get(id);
          if (!data) continue;

          data.isVisible = entry.isIntersecting;
          if (entry.isIntersecting) {
            data.isReached = true;
          }
        }
      },
      { threshold: 0.3 }
    );

    for (const el of paragraphs) {
      this.observer.observe(el);
    }

    // 1秒ごとに表示中の段落のdwellTimeを加算
    this.tickTimer = window.setInterval(() => {
      for (const data of this.gazeMap.values()) {
        if (data.isVisible) {
          data.dwellTime += 1;
        }
      }
    }, TICK_INTERVAL_MS);

    // 2.5秒ごとにコールバック発火
    this.syncTimer = window.setInterval(() => {
      this.fireCallback();
    }, SYNC_INTERVAL_MS);
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.syncTimer !== null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    // 最後に一回発火
    this.fireCallback();
  }

  private fireCallback(): void {
    if (!this.callback) return;
    const data: ParagraphGaze[] = [];
    for (const [paragraphId, gaze] of this.gazeMap) {
      data.push({
        paragraphId,
        dwellTime: gaze.dwellTime,
        isReached: gaze.isReached,
      });
    }
    this.callback(data);
  }
}
