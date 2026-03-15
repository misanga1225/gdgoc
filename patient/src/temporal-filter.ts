/**
 * 一次遅れ系フィルタ（離散近似）
 *
 * τ × dA/dt = A_raw − A
 * 離散式: A ← A + (dt/τ) × (A_raw − A)
 */
export class TemporalFilter {
  private value: number;

  constructor(
    private tau: number,
    initialValue: number = 0.5,
  ) {
    this.value = initialValue;
  }

  /**
   * フィルタを更新し、平滑化された値を返す
   * @param rawValue フィルタ前の値 A_raw
   * @param dt 経過時間（秒）
   */
  update(rawValue: number, dt: number): number {
    if (dt <= 0) return this.value;

    // dt/τ が1を超えないようにクランプ（安定性保証）
    const alpha = Math.min(dt / this.tau, 1);
    this.value += alpha * (rawValue - this.value);
    return this.value;
  }

  /** 現在のフィルタ出力 */
  get current(): number {
    return this.value;
  }

  /** フィルタをリセット */
  reset(value: number = 0.5): void {
    this.value = value;
  }
}

/**
 * 周波数からスムージング係数αを算出する
 */
function smoothingAlpha(dt: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return dt / (dt + tau);
}

/**
 * One-Euro Filter（速度適応型ローパスフィルタ）
 *
 * 固視時（低速度）は強い平滑化でジッタを抑え、
 * サッケード時（高速度）はカットオフを上げて遅延を最小化する。
 *
 * 参考: Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter
 * for Noisy Input in Interactive Systems", CHI 2012
 */
export class OneEuroFilter {
  private xPrev: number;
  private dxPrev: number = 0;
  private initialized = false;

  constructor(
    private minCutoff: number = 1.0,
    private beta: number = 0.5,
    private dCutoff: number = 1.0,
    initialValue: number = 0.5,
  ) {
    this.xPrev = initialValue;
  }

  /**
   * フィルタを更新し、平滑化された値を返す
   * @param rawValue フィルタ前の値
   * @param dt 経過時間（秒）
   */
  update(rawValue: number, dt: number): number {
    if (dt <= 0) return this.xPrev;

    if (!this.initialized) {
      this.xPrev = rawValue;
      this.initialized = true;
      return rawValue;
    }

    // 微分値のローパスフィルタ
    const dx = (rawValue - this.xPrev) / dt;
    const alphaDx = smoothingAlpha(dt, this.dCutoff);
    this.dxPrev += alphaDx * (dx - this.dxPrev);

    // 速度に応じてカットオフ周波数を調整
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);

    // 信号のローパスフィルタ
    const alphaX = smoothingAlpha(dt, cutoff);
    this.xPrev += alphaX * (rawValue - this.xPrev);

    return this.xPrev;
  }

  /** 現在のフィルタ出力 */
  get current(): number {
    return this.xPrev;
  }

  /** フィルタをリセット */
  reset(value: number = 0.5): void {
    this.xPrev = value;
    this.dxPrev = 0;
    this.initialized = false;
  }
}
