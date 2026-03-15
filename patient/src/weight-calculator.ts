import type { AttentionConfig } from "./types.js";

/**
 * スライディング窓バッファ
 * 各モダリティのスコア履歴を保持し、短時間分散を計算する
 */
export class SlidingWindow {
  private buffer: number[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = Math.max(1, maxSize);
  }

  /** 新しい値を追加 */
  push(value: number): void {
    this.buffer.push(value);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  /** 分散を計算 */
  variance(): number {
    const n = this.buffer.length;
    if (n < 2) return 0;

    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.buffer[i];
    const mean = sum / n;

    let sqSum = 0;
    for (let i = 0; i < n; i++) {
      const d = this.buffer[i] - mean;
      sqSum += d * d;
    }
    return sqSum / n;
  }

  /** バッファをリセット */
  reset(): void {
    this.buffer = [];
  }

  get length(): number {
    return this.buffer.length;
  }
}

/**
 * 動的重み w_i = c_i × 1/(1 + σ_i²)
 *
 * c_i: 検出信頼度（入力から取得）
 * σ_i²: スライディング窓の分散（信号安定度）
 */
export function computeWeight(confidence: number, variance: number): number {
  return confidence / (1 + variance);
}

/**
 * 3モダリティの重みを管理するクラス
 */
export class WeightCalculator {
  private gazeWindow: SlidingWindow;
  private mouseWindow: SlidingWindow;
  private headWindow: SlidingWindow;

  constructor(private config: AttentionConfig, fps: number = 30) {
    const windowSize = Math.max(1, Math.round(config.varianceWindowSec * fps));
    this.gazeWindow = new SlidingWindow(windowSize);
    this.mouseWindow = new SlidingWindow(windowSize);
    this.headWindow = new SlidingWindow(windowSize);
  }

  /**
   * スコアを記録し、動的重みを返す
   */
  update(
    gazeScore: number,
    mouseScore: number,
    headScore: number,
    gazeConfidence: number,
    mouseConfidence: number,
    headConfidence: number,
  ): { gaze: number; mouse: number; head: number } {
    this.gazeWindow.push(gazeScore);
    this.mouseWindow.push(mouseScore);
    this.headWindow.push(headScore);

    const cGaze = gazeConfidence * this.config.baseConfidence.gaze;
    const cMouse = mouseConfidence * this.config.baseConfidence.mouse;
    const cHead = headConfidence * this.config.baseConfidence.head;

    return {
      gaze: computeWeight(cGaze, this.gazeWindow.variance()),
      mouse: computeWeight(cMouse, this.mouseWindow.variance()),
      head: computeWeight(cHead, this.headWindow.variance()),
    };
  }

  reset(): void {
    this.gazeWindow.reset();
    this.mouseWindow.reset();
    this.headWindow.reset();
  }
}
