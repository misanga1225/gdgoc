import type { Landmark } from "./types.js";
import { LANDMARKS } from "./types.js";
import type {
  MLPWeights,
  MLPConfig,
  BlinkConfig,
  VerticalGazeFeatures,
  VerticalGazeSample,
} from "./vertical-gaze-types.js";
import { DEFAULT_MLP_CONFIG, DEFAULT_BLINK_CONFIG } from "./vertical-gaze-types.js";
import { initializeWeights, forward, train, serializeWeights, deserializeWeights } from "./mlp.js";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 片眼の垂直特徴量を計算する（5次元）
 *
 * [normEyeHeight, normIrisUpper, normIrisLower, irisRatioY, EAR]
 */
function extractSingleEyeFeatures(
  irisCenter: Landmark,
  innerCorner: Landmark,
  outerCorner: Landmark,
  upperLid: Landmark,
  lowerLid: Landmark,
): { features: number[]; ear: number } {
  const eyeWidth = Math.abs(outerCorner.x - innerCorner.x);
  const eyeHeight = lowerLid.y - upperLid.y;
  const irisUpper = irisCenter.y - upperLid.y;
  const irisLower = lowerLid.y - irisCenter.y;

  // 安全な除算
  const safeEyeWidth = eyeWidth > 1e-6 ? eyeWidth : 1e-6;

  // eyeWidthで正規化 + クリッピング
  const normEyeHeight = clamp(eyeHeight / safeEyeWidth, 0, 2);
  const normIrisUpper = clamp(irisUpper / safeEyeWidth, 0, 2);
  const normIrisLower = clamp(irisLower / safeEyeWidth, 0, 2);

  // 既存のratioY（特徴量として保持）
  const irisRatioY = eyeHeight > 1e-6
    ? clamp(irisUpper / eyeHeight, -0.5, 1.5)
    : 0.5;

  // EAR (Eye Aspect Ratio)
  const ear = eyeHeight / safeEyeWidth;

  return {
    features: [normEyeHeight, normIrisUpper, normIrisLower, irisRatioY, ear],
    ear,
  };
}

/**
 * 両目のランドマークから10次元垂直特徴量を抽出する
 */
export function extractVerticalFeatures(landmarks: Landmark[], earThreshold?: number): VerticalGazeFeatures {
  const left = extractSingleEyeFeatures(
    landmarks[LANDMARKS.LEFT_IRIS_CENTER],
    landmarks[LANDMARKS.LEFT_EYE_INNER],
    landmarks[LANDMARKS.LEFT_EYE_OUTER],
    landmarks[LANDMARKS.LEFT_EYE_UPPER],
    landmarks[LANDMARKS.LEFT_EYE_LOWER],
  );

  const right = extractSingleEyeFeatures(
    landmarks[LANDMARKS.RIGHT_IRIS_CENTER],
    landmarks[LANDMARKS.RIGHT_EYE_INNER],
    landmarks[LANDMARKS.RIGHT_EYE_OUTER],
    landmarks[LANDMARKS.RIGHT_EYE_UPPER],
    landmarks[LANDMARKS.RIGHT_EYE_LOWER],
  );

  const avgEAR = (left.ear + right.ear) / 2;

  return {
    features: [...left.features, ...right.features],
    avgEAR,
    isBlinking: avgEAR < (earThreshold ?? DEFAULT_BLINK_CONFIG.earThreshold),
  };
}

/**
 * 垂直視線補正器
 *
 * 2層MLPで ratioY を補正し、まばたき検出でノイズを除去する。
 */
export class VerticalGazeRefiner {
  private weights: MLPWeights | null = null;
  private config: MLPConfig;
  private blinkConfig: BlinkConfig;
  private lastValidRatioY = 0.5;
  private blinkHoldCounter = 0;

  constructor(
    config?: Partial<MLPConfig>,
    blinkConfig?: Partial<BlinkConfig>,
  ) {
    this.config = { ...DEFAULT_MLP_CONFIG, ...config };
    this.blinkConfig = { ...DEFAULT_BLINK_CONFIG, ...blinkConfig };
  }

  /** MLPを学習させる */
  train(samples: VerticalGazeSample[]): { finalLoss: number } {
    this.weights = initializeWeights(this.config);
    const finalLoss = train(samples, this.weights, this.config);
    return { finalLoss };
  }

  /**
   * 1フレームのratioYを補正する
   *
   * @returns 補正されたratioYとまばたきフラグ
   */
  refine(landmarks: Landmark[]): { ratioY: number; isBlinking: boolean } {
    const extracted = extractVerticalFeatures(landmarks, this.blinkConfig.earThreshold);

    // まばたき中：最後の有効値を保持
    if (extracted.isBlinking) {
      this.blinkHoldCounter = this.blinkConfig.holdFrames;
      return { ratioY: this.lastValidRatioY, isBlinking: true };
    }

    // まばたき直後のホールド期間
    if (this.blinkHoldCounter > 0) {
      this.blinkHoldCounter--;
      return { ratioY: this.lastValidRatioY, isBlinking: false };
    }

    // MLP推論
    if (this.weights) {
      const raw = forward(extracted.features, this.weights, this.config);
      const ratioY = clamp(raw, -0.2, 1.2);
      this.lastValidRatioY = ratioY;
      return { ratioY, isBlinking: false };
    }

    // 未学習時：特徴量からirisRatioYの平均をフォールバック
    const leftRatioY = extracted.features[3];
    const rightRatioY = extracted.features[8];
    const fallback = (leftRatioY + rightRatioY) / 2;
    this.lastValidRatioY = fallback;
    return { ratioY: fallback, isBlinking: false };
  }

  get isTrained(): boolean {
    return this.weights !== null;
  }

  exportWeights(): string | null {
    if (!this.weights) return null;
    return serializeWeights(this.weights);
  }

  importWeights(json: string): void {
    this.weights = deserializeWeights(json);
  }

  /** 適応的EAR閾値を設定する（キャリブレーション後に呼ばれる） */
  setEarThreshold(threshold: number): void {
    this.blinkConfig = { ...this.blinkConfig, earThreshold: threshold };
  }

  reset(): void {
    this.weights = null;
    this.lastValidRatioY = 0.5;
    this.blinkHoldCounter = 0;
  }
}
