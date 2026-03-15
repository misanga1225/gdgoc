import type { ElementAttentionRecord } from "./types.js";

/**
 * DOM要素ごとに注意度を蓄積する。
 * 減衰なし — セッション全体の積分を記録する。
 */
export class ElementAttentionTracker {
  private records = new Map<Element, ElementAttentionRecord>();

  /**
   * フレームごとに呼び出す。el が現在の注視対象のとき。
   * @param el 注視中のDOM要素
   * @param attentionScore AttentionModel の出力 [0,1]
   * @param dt フレーム間隔（秒）
   */
  update(el: Element, attentionScore: number, dt: number): void {
    let record = this.records.get(el);
    if (!record) {
      record = {
        element: el,
        accumulatedAttention: 0,
        totalDwellTime: 0,
        lastUpdatedAt: 0,
      };
      this.records.set(el, record);
    }
    record.accumulatedAttention += attentionScore * dt;
    record.totalDwellTime += dt;
    record.lastUpdatedAt = performance.now() / 1000;
  }

  /** 指定要素のレコードを取得 */
  getRecord(el: Element): ElementAttentionRecord | undefined {
    return this.records.get(el);
  }

  /** 全レコードを返す */
  getAllRecords(): ElementAttentionRecord[] {
    return Array.from(this.records.values());
  }

  /** 記録件数 */
  get size(): number {
    return this.records.size;
  }

  reset(): void {
    this.records.clear();
  }
}
