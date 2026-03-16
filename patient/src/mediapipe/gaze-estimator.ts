import type { IrisResult, HeadPoseResult, GazeFeatures } from "./types.js";
import type { RidgeRegression } from "../calibration/ridge-regression.js";
import type { Point2D } from "../types.js";
import { OneEuroFilter } from "../temporal-filter.js";

/**
 * 視線推定器
 * 虹彩比率 + 頭部姿勢 → キャリブレーション済みスクリーン座標
 */
export class GazeEstimator {
  private regression: RidgeRegression | null = null;
  private lensGammaX: number = 1.0;
  private lensGammaY: number = 1.0;
  private headKx: number = 0; // 頭部回転補正係数 x (正規化座標/度)
  private headKy: number = 0; // 頭部回転補正係数 y (正規化座標/度)
  private selectedFeatures: number[] | null = null; // LOO-CVで選択された特徴量インデックス
  // 虹彩ratio One-Euroプリフィルタ（速度適応型: 注視時は強平滑化、サッカード時は低遅延）
  // fc_min=1.5Hz: 注視時の強い平滑化（τ≈106ms）
  // beta=30: サッカード速度~3 units/sでfc≈90Hz（ほぼ素通し）
  // d_cutoff=1.0Hz: 速度信号自体の平滑化
  private static readonly IRIS_FC_MIN = 1.5;
  private static readonly IRIS_BETA = 30;
  private static readonly IRIS_D_CUTOFF = 1.0;
  private irisFilter = {
    lX: new OneEuroFilter(GazeEstimator.IRIS_FC_MIN, GazeEstimator.IRIS_BETA, GazeEstimator.IRIS_D_CUTOFF, 0.5),
    lY: new OneEuroFilter(GazeEstimator.IRIS_FC_MIN, GazeEstimator.IRIS_BETA, GazeEstimator.IRIS_D_CUTOFF, 0.5),
    rX: new OneEuroFilter(GazeEstimator.IRIS_FC_MIN, GazeEstimator.IRIS_BETA, GazeEstimator.IRIS_D_CUTOFF, 0.5),
    rY: new OneEuroFilter(GazeEstimator.IRIS_FC_MIN, GazeEstimator.IRIS_BETA, GazeEstimator.IRIS_D_CUTOFF, 0.5),
  };
  private yOffset: number = 0; // Y軸オフセット補正（ユーザー調整用）

  /** キャリブレーション済みの回帰モデルを設定 */
  setRegression(
    regression: RidgeRegression,
    lensGamma: number | { x: number; y: number } = 1.0,
    headKx: number = 0,
    headKy: number = 0,
    selectedFeatures?: number[],
  ): void {
    this.regression = regression;
    if (typeof lensGamma === "number") {
      this.lensGammaX = lensGamma;
      this.lensGammaY = lensGamma;
    } else {
      this.lensGammaX = lensGamma.x;
      this.lensGammaY = lensGamma.y;
    }
    this.headKx = headKx;
    this.headKy = headKy;
    this.selectedFeatures = selectedFeatures ?? null;
  }

  /** キャリブレーション済みかどうか */
  get isCalibrated(): boolean {
    return this.regression !== null;
  }

  /**
   * 虹彩データと頭部姿勢から特徴ベクトルを構成する
   */
  extractFeatures(iris: IrisResult, headPose: HeadPoseResult): GazeFeatures {
    const avgX = (iris.leftRatioX + iris.rightRatioX) / 2;
    const avgY = (iris.leftRatioY + iris.rightRatioY) / 2;
    const yawN = headPose.yaw / 90;
    const pitchN = headPose.pitch / 30;
    return [
      iris.leftRatioX,
      iris.leftRatioY,
      iris.rightRatioX,
      iris.rightRatioY,
      yawN,                   // [-1,1]に正規化
      pitchN,                 // 実使用範囲±15°で±0.5に
      iris.interEyeDist,      // 顔サイズ/距離プロキシ
      iris.avgNormEyeHeight,  // まぶた開き幅（縦方向視線と相関）
      // 2次の交互作用項（非線形性を捕捉）
      avgX * avgX,              // 水平の2次効果
      avgY * avgY,              // 垂直の2次効果
      avgX * yawN,              // 視線×頭部回転の交互作用
      avgY * pitchN,            // 視線×頭部傾きの交互作用
      avgX * avgY,              // 水平×垂直の交互作用
      avgX * iris.interEyeDist, // 距離依存の水平補正
      // EAR-ratioY連成補正（下を見ると目が閉じ気味になる非線形効果を捕捉）
      iris.avgNormEyeHeight * avgY,
    ];
  }

  /**
   * スクリーン座標を推定する
   * キャリブレーション前はiris比率からの簡易マッピングを返す
   */
  /** Y軸オフセットを設定（ユーザー調整用、[-0.2, 0.2]程度） */
  setYOffset(offset: number): void {
    this.yOffset = offset;
  }

  estimate(iris: IrisResult, headPose: HeadPoseResult, dt: number = 1 / 30): Point2D {
    // 虹彩ratioをOne-Euro Filterで平滑化
    // 注視時は強い平滑化でジッタを抑え、サッカード時はカットオフを上げて遅延を最小化
    const f = this.irisFilter;
    const lX = f.lX.update(iris.leftRatioX, dt);
    const lY = f.lY.update(iris.leftRatioY, dt);
    const rX = f.rX.update(iris.rightRatioX, dt);
    const rY = f.rY.update(iris.rightRatioY, dt);
    const smoothedIris: IrisResult = {
      ...iris,
      leftRatioX: lX, leftRatioY: lY,
      rightRatioX: rX, rightRatioY: rY,
      avgRatioX: (lX + rX) / 2,
      avgRatioY: (lY + rY) / 2,
    };

    if (this.regression) {
      const allFeatures = this.extractFeatures(smoothedIris, headPose);
      const features = this.selectedFeatures
        ? this.selectedFeatures.map((i) => allFeatures[i])
        : [...allFeatures];
      const [rawX, rawY] = this.regression.predict(features);
      // レンズ補正後に頭部姿勢補正を適用（キャリブレーション範囲外の yaw/pitch に対応）
      return {
        x: clamp(lensCorrect(rawX, this.lensGammaX) + this.headKx * headPose.yaw, 0, 1),
        y: clamp(lensCorrect(rawY, this.lensGammaY) + this.headKy * headPose.pitch + this.yOffset, 0, 1),
      };
    }

    // フォールバック: 虹彩比率からの動的スケーリング付き線形マッピング
    // interEyeDistで顔距離に応じてマッピング幅を調整
    const baseSpanX = 0.3;
    const baseSpanY = 0.2; // ratioYの実可動域 ~0.20 に合わせる（旧0.4は2倍過大）
    const refDist = 0.15; // 基準距離（中程度の距離での典型的なinterEyeDist）
    const distScale = Math.max(smoothedIris.interEyeDist / refDist, 0.5); // 下限0.5で過剰増幅を防止
    const spanX = baseSpanX * distScale;
    const spanY = baseSpanY * distScale;
    return {
      x: clamp((smoothedIris.avgRatioX - 0.5) / spanX + 0.5, 0, 1),
      y: clamp((smoothedIris.avgRatioY - 0.5) / spanY + 0.5 + this.yOffset, 0, 1),
    };
  }

  /** キャリブレーションをリセット */
  reset(): void {
    this.regression = null;
    this.lensGammaX = 1.0;
    this.lensGammaY = 1.0;
    this.headKx = 0;
    this.headKy = 0;
    this.selectedFeatures = null;
    this.irisFilter.lX.reset(0.5);
    this.irisFilter.lY.reset(0.5);
    this.irisFilter.rX.reset(0.5);
    this.irisFilter.rY.reset(0.5);
    this.yOffset = 0;
  }
}

/**
 * 冪乗則による端部伸張（レンズ補正）
 * Ridge回帰の出力に適用し、中央バイアスを補正する
 *
 * x' = 0.5 + sign(x - 0.5) * 0.5 * (2|x - 0.5|)^γ
 *
 * γ = 1.0: 恒等変換（補正なし）
 * γ < 1.0: 端を外側に伸張
 */
function lensCorrect(v: number, gamma: number): number {
  if (gamma === 1.0) return v;
  const d = v - 0.5;
  const sign = d >= 0 ? 1 : -1;
  const t = Math.abs(d) * 2;
  // 中央付近 (t < BLEND_T) では冪乗則の微分 γt^(γ-1) が発散し、
  // 小さな回帰誤差が過剰に増幅される。原点から (BLEND_T, BLEND_T^γ) への
  // 線形補間でゲインを有限に制限する。
  const BLEND_T = 0.1;
  const stretched = t < BLEND_T
    ? t * Math.pow(BLEND_T, gamma - 1)
    : Math.pow(t, gamma);
  return 0.5 + sign * stretched * 0.5;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
