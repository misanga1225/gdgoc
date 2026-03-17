import type { Point2D } from "../types.js";
import type { GazeFeatures, Landmark } from "../mediapipe/types.js";
import type { CalibrationPoint, CalibrationState, CalibrationConfig } from "./types.js";
import { DEFAULT_CALIBRATION_CONFIG } from "./types.js";
import { RidgeRegression } from "./ridge-regression.js";
import type { VerticalGazeSample } from "../mediapipe/vertical-gaze-types.js";
import { extractVerticalFeatures } from "../mediapipe/vertical-gaze-mlp.js";

/**
 * キャリブレーションマネージャ
 * 9点グリッドのキャリブレーションフローを管理する
 */
export class CalibrationManager {
  private config: CalibrationConfig;
  private points: CalibrationPoint[] = [];
  private state: CalibrationState = { phase: "idle" };
  private pointStartTime = 0;
  private warmupEarSamples: number[] = []; // warmup中のEAR収集（適応的閾値用）

  constructor(config?: Partial<CalibrationConfig>) {
    this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
  }

  /** キャリブレーション設定を返す */
  getConfig(): Readonly<CalibrationConfig> {
    return this.config;
  }

  /** キャリブレーションを開始する */
  start(): void {
    this.points = this.generateGridPoints();
    this.state = { phase: "collecting", pointIndex: 0, elapsed: 0 };
    this.pointStartTime = 0;
  }

  /** 現在の状態を返す */
  getState(): CalibrationState {
    return this.state;
  }

  /** 現在のキャリブレーション点を返す */
  getCurrentPoint(): Point2D | null {
    if (this.state.phase !== "collecting") return null;
    return this.points[this.state.pointIndex].screenPos;
  }

  /** 総ポイント数 */
  get totalPoints(): number {
    return this.points.length;
  }

  /**
   * フレームごとに呼ばれる。特徴ベクトルを収集する。
   * @returns true: まだ収集中, false: 全点完了
   */
  addSample(features: GazeFeatures, dt: number, ear?: number): boolean {
    if (this.state.phase !== "collecting") return false;

    this.pointStartTime += dt;
    this.state = {
      phase: "collecting",
      pointIndex: this.state.pointIndex,
      elapsed: this.pointStartTime,
    };

    // ウォームアップ期間はスキップ（EARは収集する）
    if (this.pointStartTime < this.config.warmupTimeSec) {
      if (ear !== undefined && ear > 0) {
        this.warmupEarSamples.push(ear);
      }
      return true;
    }

    // サンプル収集
    this.points[this.state.pointIndex].samples.push([...features] as GazeFeatures);

    // 滞在時間が終了したら次の点へ
    if (this.pointStartTime >= this.config.dwellTimeSec) {
      const nextIndex = this.state.pointIndex + 1;
      if (nextIndex >= this.points.length) {
        this.state = { phase: "computing" };
        return false;
      }
      this.state = { phase: "collecting", pointIndex: nextIndex, elapsed: 0 };
      this.pointStartTime = 0;
    }

    return true;
  }

  /**
   * 収集したデータからリッジ回帰モデルを訓練する
   * @returns 訓練済みモデルと平均誤差
   */
  compute(lambda: number = 1.0): { regression: RidgeRegression; meanError: number; lensGammaX: number; lensGammaY: number; headKx: number; headKy: number; selectedFeatures: number[]; adaptiveEarThreshold: number | null } {
    // 各点のサンプルから外れ値を除去（MADベース）
    for (const point of this.points) {
      if (point.samples.length >= 5) {
        point.samples = rejectOutliers(point.samples);
      }
    }

    // LOO-CVベースの後退消去法で特徴量を選択
    // 実際のサンプル次元数を検出（GazeFeaturesは14だがテストでは短い場合がある）
    const sampleDim = this.points.find(p => p.samples.length > 0)?.samples[0].length ?? 14;
    const allIndices = Array.from({ length: sampleDim }, (_, i) => i);
    const selectedFeatures = this.selectFeaturesByLOOCV(allIndices, lambda);

    // Ridge λ の自動チューニング（LOO-CVで最適λを選択）
    const lambdaCandidates = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0];
    let bestLambda = lambda;
    let bestLambdaError = Infinity;
    for (const lc of lambdaCandidates) {
      const err = this.computeLOOCVError(selectedFeatures, lc);
      if (err < bestLambdaError) {
        bestLambdaError = err;
        bestLambda = lc;
      }
    }
    console.log(`[CalibrationManager] optimized lambda (LOO-CV): ${bestLambda} (error=${bestLambdaError.toFixed(6)})`);

    const X: number[][] = [];
    const Y: number[][] = [];

    for (const point of this.points) {
      for (const sample of point.samples) {
        X.push(selectColumns(sample, selectedFeatures));
        Y.push([point.screenPos.x, point.screenPos.y]);
      }
    }

    if (X.length < 6) {
      throw new Error(`Insufficient samples: ${X.length} (need at least 6)`);
    }

    const regression = new RidgeRegression(bestLambda);
    regression.fit(X, Y);

    // Leave-one-point-out 交差検証で誤差を推定 + 頭部姿勢補正係数を学習
    const { meanError, headKx, headKy } = this.computeValidationAndHeadCorrection(bestLambda, selectedFeatures);

    // X/Y軸別にレンズ補正ガンマを自動チューニング（LOO-CV）
    const { gammaX, gammaY } = this.optimizeLensGamma(regression, bestLambda, selectedFeatures);

    // 適応的EAR閾値: warmup中のEARから個人化された閾値を算出
    const adaptiveEarThreshold = this.computeAdaptiveEarThreshold();

    this.state = { phase: "done", error: meanError };
    return { regression, meanError, lensGammaX: gammaX, lensGammaY: gammaY, headKx, headKy, selectedFeatures, adaptiveEarThreshold };
  }

  /**
   * 垂直キャリブレーション用のサンプルを収集する
   *
   * まばたき中のフレームは自動的にスキップされる。
   * @param landmarks MediaPipeの478ランドマーク
   * @param targetY 画面上の目標Y座標 [0,1]
   * @returns サンプル、またはまばたき中の場合null
   */
  collectVerticalSample(
    landmarks: Landmark[],
    targetY: number,
  ): VerticalGazeSample | null {
    const extracted = extractVerticalFeatures(landmarks);
    if (extracted.isBlinking) return null;
    return { features: extracted.features, targetY };
  }

  /**
   * warmup中に収集したEARから適応的なまばたき閾値を計算する
   * threshold = mean_EAR - 2.5 * std_EAR、[0.02, 0.10] でクランプ
   */
  private computeAdaptiveEarThreshold(): number | null {
    const samples = this.warmupEarSamples;
    if (samples.length < 10) return null; // サンプル不足

    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance);

    const threshold = Math.max(0.02, Math.min(0.10, mean - 2.5 * std));
    console.log(
      `[CalibrationManager] adaptive EAR threshold: ${threshold.toFixed(4)} (mean=${mean.toFixed(4)}, std=${std.toFixed(4)}, n=${samples.length})`,
    );
    return threshold;
  }

  /** リセット */
  reset(): void {
    this.points = [];
    this.state = { phase: "idle" };
    this.pointStartTime = 0;
    this.warmupEarSamples = [];
  }

  // --- private ---

  /**
   * LOO-CVベースの後退消去法（Backward Elimination）で特徴量を選択する
   *
   * 各ステップで1特徴量を除外した場合のLOO-CV誤差を計算し、
   * 除外しても誤差が増えない（ΔLOO ≤ 0）特徴量のうち最も改善するものを除去する。
   * 全候補の除外で誤差が増える場合に停止する。
   */
  private selectFeaturesByLOOCV(
    initialIndices: number[],
    lambda: number,
  ): number[] {
    let currentIndices = [...initialIndices];

    // 基本特徴量（最初の8個: 虹彩4 + 頭部2 + 距離 + 開眼幅）は必ず保持
    // 後退消去の対象は2次の交互作用項（index 8-13）のみ
    const MIN_FEATURES = 8;

    while (currentIndices.length > MIN_FEATURES) {
      const baselineError = this.computeLOOCVError(currentIndices, lambda);
      let bestDelta = 0; // ΔLOO ≤ 0 で改善するもの
      let bestRemoveIdx = -1;

      for (let k = 0; k < currentIndices.length; k++) {
        // 基本特徴量（index 0-7）は除去対象外
        if (currentIndices[k] < 8) continue;

        const candidateIndices = currentIndices.filter((_, i) => i !== k);
        const candidateError = this.computeLOOCVError(candidateIndices, lambda);
        const delta = candidateError - baselineError; // 負=改善

        if (delta <= 0 && delta < bestDelta) {
          bestDelta = delta;
          bestRemoveIdx = k;
        }
      }

      if (bestRemoveIdx === -1) break; // 除去で改善する特徴量がない

      const removed = currentIndices[bestRemoveIdx];
      currentIndices = currentIndices.filter((_, i) => i !== bestRemoveIdx);
      console.log(
        `[FeatureSelection] removed feature ${removed}, ΔLOO=${bestDelta.toFixed(6)}, remaining: [${currentIndices.join(",")}]`,
      );
    }

    console.log(
      `[FeatureSelection] final features (${currentIndices.length}/${initialIndices.length}): [${currentIndices.join(",")}]`,
    );
    return currentIndices;
  }

  /**
   * 指定された特徴量インデックスでのLOO-CV平均誤差を計算する
   */
  private computeLOOCVError(featureIndices: number[], lambda: number): number {
    const nPoints = this.points.length;
    let totalError = 0;
    let count = 0;

    for (let leaveOut = 0; leaveOut < nPoints; leaveOut++) {
      const trainX: number[][] = [];
      const trainY: number[][] = [];

      for (let i = 0; i < nPoints; i++) {
        if (i === leaveOut) continue;
        for (const sample of this.points[i].samples) {
          trainX.push(selectColumns(sample, featureIndices));
          trainY.push([this.points[i].screenPos.x, this.points[i].screenPos.y]);
        }
      }

      if (trainX.length < featureIndices.length + 1) continue;

      const reg = new RidgeRegression(lambda);
      reg.fit(trainX, trainY);

      for (const sample of this.points[leaveOut].samples) {
        const [px, py] = reg.predict(selectColumns(sample, featureIndices));
        const target = this.points[leaveOut].screenPos;
        totalError += Math.sqrt((px - target.x) ** 2 + (py - target.y) ** 2);
        count++;
      }
    }

    return count > 0 ? totalError / count : Infinity;
  }

  /** グリッド上のキャリブレーション点を生成 */
  private generateGridPoints(): CalibrationPoint[] {
    const { gridSize, margin } = this.config;
    const rows = this.config.gridRows ?? gridSize;
    const cols = this.config.gridCols ?? gridSize;
    const points: CalibrationPoint[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = margin + (col / (cols - 1)) * (1 - 2 * margin);
        const y = margin + (row / (rows - 1)) * (1 - 2 * margin);
        points.push({ screenPos: { x, y }, samples: [] });
      }
    }

    // 補助点（中央精度向上など）
    for (const p of this.config.extraPoints ?? []) {
      points.push({ screenPos: p, samples: [] });
    }

    return points;
  }

  /**
   * X/Y軸別にレンズ補正ガンマを最適化する
   *
   * Leave-One-Point-Out 交差検証を用いてγを選択する。
   * 各fold で回帰を再学習し、holdout点に対する予測にγを適用して
   * 誤差を評価するため、in-sample 過学習を回避する。
   *
   * 候補: γ ∈ {0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0}
   */
  private optimizeLensGamma(
    regression: RidgeRegression,
    lambda: number = 1.0,
    selectedFeatures?: number[],
  ): { gammaX: number; gammaY: number } {
    const defaultGamma = this.config.lensGamma ?? 1.0;
    const nPoints = this.points.length;
    if (nPoints < 3) return { gammaX: defaultGamma, gammaY: defaultGamma };

    // LOO予測を収集（各点を1つずつholdout）
    const looPredictions: { predX: number; predY: number; targetX: number; targetY: number }[] = [];

    for (let leaveOut = 0; leaveOut < nPoints; leaveOut++) {
      const trainX: number[][] = [];
      const trainY: number[][] = [];
      for (let i = 0; i < nPoints; i++) {
        if (i === leaveOut) continue;
        for (const sample of this.points[i].samples) {
          trainX.push(selectedFeatures ? selectColumns(sample, selectedFeatures) : [...sample]);
          trainY.push([this.points[i].screenPos.x, this.points[i].screenPos.y]);
        }
      }
      if (trainX.length < 6) continue;

      const reg = new RidgeRegression(lambda);
      reg.fit(trainX, trainY);

      // holdout点のサンプルに対する予測を記録
      for (const sample of this.points[leaveOut].samples) {
        const features = selectedFeatures ? selectColumns(sample, selectedFeatures) : [...sample];
        const [px, py] = reg.predict(features);
        looPredictions.push({
          predX: px, predY: py,
          targetX: this.points[leaveOut].screenPos.x,
          targetY: this.points[leaveOut].screenPos.y,
        });
      }
    }

    if (looPredictions.length === 0) return { gammaX: defaultGamma, gammaY: defaultGamma };

    // 黄金分割法による連続γ最適化
    // 離散グリッド探索 {0.35,...,1.0} を連続探索に置き換え、精度0.01で最適γを特定
    function findBestGamma(
      preds: typeof looPredictions,
      axis: "x" | "y",
    ): number {
      function evalGamma(g: number): number {
        let totalError = 0;
        for (const p of preds) {
          const pred = axis === "x" ? p.predX : p.predY;
          const target = axis === "x" ? p.targetX : p.targetY;
          const corrected = lensCorrectValue(pred, g);
          totalError += (corrected - target) ** 2;
        }
        return totalError;
      }

      // 黄金分割法: 区間 [0.2, 1.2] を精度 0.01 まで収束
      const PHI = (1 + Math.sqrt(5)) / 2;
      let a = 0.2, b = 1.2;
      let c = b - (b - a) / PHI;
      let d = a + (b - a) / PHI;
      let fc = evalGamma(c);
      let fd = evalGamma(d);

      while (Math.abs(b - a) > 0.01) {
        if (fc < fd) {
          b = d;
          d = c;
          fd = fc;
          c = b - (b - a) / PHI;
          fc = evalGamma(c);
        } else {
          a = c;
          c = d;
          fc = fd;
          d = a + (b - a) / PHI;
          fd = evalGamma(d);
        }
      }

      const optimalGamma = (a + b) / 2;

      // フォールバック: γ=1.0（恒等変換）より悪化する場合は1.0を使用
      const errorOptimal = evalGamma(optimalGamma);
      const errorIdentity = evalGamma(1.0);
      if (errorOptimal > errorIdentity) return 1.0;

      return optimalGamma;
    }

    const gammaX = findBestGamma(looPredictions, "x");
    const gammaY = findBestGamma(looPredictions, "y");

    console.log(`[CalibrationManager] optimized lensGamma (golden-section): X=${gammaX.toFixed(3)}, Y=${gammaY.toFixed(3)}`);
    return { gammaX, gammaY };
  }

  /** Leave-one-point-out 交差検証 + 頭部姿勢補正係数の学習 */
  private computeValidationAndHeadCorrection(
    lambda: number,
    selectedFeatures?: number[],
  ): { meanError: number; headKx: number; headKy: number } {
    const nPoints = this.points.length;
    let totalError = 0;
    let count = 0;

    // LOO残差から kx/ky を学習するための蓄積変数
    let sumResXYaw = 0, sumYaw2 = 0;
    let sumResYPitch = 0, sumPitch2 = 0;
    let yawValues: number[] = [];
    let pitchValues: number[] = [];

    for (let leaveOut = 0; leaveOut < nPoints; leaveOut++) {
      const trainX: number[][] = [];
      const trainY: number[][] = [];

      for (let i = 0; i < nPoints; i++) {
        if (i === leaveOut) continue;
        for (const sample of this.points[i].samples) {
          trainX.push(selectedFeatures ? selectColumns(sample, selectedFeatures) : [...sample]);
          trainY.push([this.points[i].screenPos.x, this.points[i].screenPos.y]);
        }
      }

      if (trainX.length < 6) continue;

      const reg = new RidgeRegression(lambda);
      reg.fit(trainX, trainY);

      for (const sample of this.points[leaveOut].samples) {
        const features = selectedFeatures ? selectColumns(sample, selectedFeatures) : [...sample];
        const [px, py] = reg.predict(features);
        const target = this.points[leaveOut].screenPos;
        const err = Math.sqrt((px - target.x) ** 2 + (py - target.y) ** 2);
        totalError += err;
        count++;

        // 残差 = true - pred（補正すべき量）
        const resX = target.x - px;
        const resY = target.y - py;
        // フルサンプルから yaw/pitch を取得（feature[4] = yaw/90, feature[5] = pitch/30）
        const yaw = (sample[4] as number) * 90;
        const pitch = (sample[5] as number) * 30;

        sumResXYaw += resX * yaw;
        sumYaw2 += yaw * yaw;
        sumResYPitch += resY * pitch;
        sumPitch2 += pitch * pitch;
        yawValues.push(yaw);
        pitchValues.push(pitch);
      }
    }

    // yaw の標準偏差を計算（信頼性チェック）
    const yawMean = yawValues.reduce((a, b) => a + b, 0) / (yawValues.length || 1);
    const yawStd = Math.sqrt(
      yawValues.reduce((a, b) => a + (b - yawMean) ** 2, 0) / (yawValues.length || 1),
    );

    // 最小二乗解: kx = Σ(resX * yaw) / Σ(yaw²), ky = Σ(resY * pitch) / Σ(pitch²)
    const HEAD_CORR_CLAMP = 0.015; // 物理的上限 (1.5% screen / degree)
    const MIN_YAW_STD = 2.0;       // yaw標準偏差の信頼性閾値 (degrees)
    const MIN_PITCH_STD = 1.0;     // pitch標準偏差の信頼性閾値 (degrees, yawより低い: pitch範囲が自然に小さいため)

    // pitch分散を計算（headKyの信頼性チェック用）
    const pitchMean = pitchValues.reduce((a, b) => a + b, 0) / (pitchValues.length || 1);
    const pitchStd = Math.sqrt(
      pitchValues.reduce((a, b) => a + (b - pitchMean) ** 2, 0) / (pitchValues.length || 1),
    );

    let headKx = 0;
    let headKy = 0;

    if (yawStd >= MIN_YAW_STD && sumYaw2 > 1e-9) {
      headKx = Math.max(-HEAD_CORR_CLAMP, Math.min(HEAD_CORR_CLAMP, sumResXYaw / sumYaw2));
    }
    if (pitchStd >= MIN_PITCH_STD && sumPitch2 > 1e-9) {
      headKy = Math.max(-HEAD_CORR_CLAMP, Math.min(HEAD_CORR_CLAMP, sumResYPitch / sumPitch2));
    }

    console.log(`[CalibrationManager] yaw std: ${yawStd.toFixed(2)}°, learned headKx=${headKx.toFixed(5)}, headKy=${headKy.toFixed(5)}`);
    console.log(`[CalibrationManager] pitch std: ${pitchStd.toFixed(2)}°`);
    if (yawStd < MIN_YAW_STD) {
      console.log(`[CalibrationManager] yaw variance too low (${yawStd.toFixed(2)}° < ${MIN_YAW_STD}°): headKx defaulted to 0`);
    }
    if (pitchStd < MIN_PITCH_STD) {
      console.log(`[CalibrationManager] pitch variance too low (${pitchStd.toFixed(2)}° < ${MIN_PITCH_STD}°): headKy defaulted to 0`);
    }

    return { meanError: count > 0 ? totalError / count : Infinity, headKx, headKy };
  }
}

/** 特徴ベクトルから指定されたインデックスの列のみを抽出する */
function selectColumns(sample: ArrayLike<number>, indices: number[]): number[] {
  return indices.map((i) => sample[i]);
}

/** 冪乗則レンズ補正（gaze-estimator.ts の lensCorrect と同一ロジック） */
function lensCorrectValue(v: number, gamma: number): number {
  if (gamma === 1.0) return v;
  const d = v - 0.5;
  const sign = d >= 0 ? 1 : -1;
  const t = Math.abs(d) * 2;
  const BLEND_T = 0.1;
  const stretched = t < BLEND_T
    ? t * Math.pow(BLEND_T, gamma - 1)
    : Math.pow(t, gamma);
  return 0.5 + sign * stretched * 0.5;
}

/**
 * MAD（中央値絶対偏差）ベースの外れ値除去
 * 各特徴次元のMADを計算し、3σ相当を超えるサンプルを除去する
 */
function rejectOutliers(
  samples: GazeFeatures[],
  threshold: number = 3.0,
): GazeFeatures[] {
  const n = samples.length;
  if (n < 5) return samples;

  const dim = samples[0].length;

  // 各次元の中央値を計算
  const medians: number[] = [];
  for (let d = 0; d < dim; d++) {
    const sorted = samples.map((s) => s[d]).sort((a, b) => a - b);
    medians.push(sorted[Math.floor(n / 2)]);
  }

  // 各次元のMADを計算
  const mads: number[] = [];
  for (let d = 0; d < dim; d++) {
    const absDevs = samples.map((s) => Math.abs(s[d] - medians[d])).sort((a, b) => a - b);
    const mad = absDevs[Math.floor(n / 2)];
    mads.push(mad);
  }

  // MAD → σ推定: σ ≈ 1.4826 × MAD
  const sigmas = mads.map((m) => m * 1.4826);

  // 閾値を超えるサンプルを除去
  return samples.filter((sample) => {
    for (let d = 0; d < dim; d++) {
      if (sigmas[d] < 1e-9) continue; // 分散がほぼゼロの次元はスキップ
      if (Math.abs(sample[d] - medians[d]) > threshold * sigmas[d]) {
        return false;
      }
    }
    return true;
  });
}
