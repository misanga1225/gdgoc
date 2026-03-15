import type { FrameInput, AttentionOutput, AttentionConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./config.js";
import { computeGazeScore } from "./gaze-score.js";
import { computeMouseScore } from "./mouse-score.js";
import { computeHeadScore } from "./head-score.js";
import { WeightCalculator } from "./weight-calculator.js";
import { TemporalFilter } from "./temporal-filter.js";

/**
 * 注意度モデル
 *
 * 3モダリティ（視線・マウス・頭部姿勢）を動的重み付きで融合し、
 * 一次遅れ系フィルタで時間平滑化した注意度 A ∈ [0,1] を出力する。
 */
export class AttentionModel {
  private config: AttentionConfig;
  private weightCalc: WeightCalculator;
  private temporalFilter: TemporalFilter;

  constructor(config?: Partial<AttentionConfig>, fps: number = 30) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config?.baseConfidence) {
      this.config.baseConfidence = {
        ...DEFAULT_CONFIG.baseConfidence,
        ...config.baseConfidence,
      };
    }
    this.weightCalc = new WeightCalculator(this.config, fps);
    this.temporalFilter = new TemporalFilter(this.config.temporalTau);
  }

  /**
   * 1フレーム分の入力を処理し、注意度を返す
   */
  update(input: FrameInput): AttentionOutput {
    // 1. 各モダリティのスコアを計算
    const gazeScore = computeGazeScore(input.gaze, input.region, this.config);
    const mouseScore = computeMouseScore(input.mouse, input.region, this.config);
    const headScore = computeHeadScore(input.headPose, this.config);

    // 2. 動的重みを計算
    const weights = this.weightCalc.update(
      gazeScore,
      mouseScore,
      headScore,
      input.gaze.faceDetected ? input.gaze.confidence : 0,
      input.mouse.confidence,
      input.headPose.confidence,
    );

    // 3. 重み付き融合
    const totalWeight = weights.gaze + weights.mouse + weights.head;
    const rawAttention =
      totalWeight > 0
        ? (weights.gaze * gazeScore + weights.mouse * mouseScore + weights.head * headScore) /
          totalWeight
        : 0.5; // 全信号が無効な場合のフォールバック

    // 4. 時間フィルタ適用
    const attention = this.temporalFilter.update(rawAttention, input.dt);

    return {
      attention,
      gazeScore,
      mouseScore,
      headScore,
      weights,
      rawAttention,
    };
  }

  /** モデルの状態をリセット */
  reset(): void {
    this.weightCalc.reset();
    this.temporalFilter.reset();
  }

  /** 現在の設定を取得 */
  getConfig(): Readonly<AttentionConfig> {
    return this.config;
  }
}
