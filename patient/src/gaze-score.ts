import type { GazeInput, Region, AttentionConfig } from "./types.js";

/** 2点間のユークリッド距離 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 視線スコアを計算する
 *
 * P_g = exp(-d² / (2σ²))   ただし σ = ratio × region_radius
 * 顔未検出時: P_g = 0.5
 */
export function computeGazeScore(
  gaze: GazeInput,
  region: Region,
  config: AttentionConfig,
): number {
  if (!gaze.faceDetected) {
    return 0.5;
  }

  // σ = max(デフォルトσ, キャリブレーション誤差×1.5) でキャリブレーション品質に適応
  const baseSigma = config.gazeSigmaRatio * region.radius;
  const sigma = config.calibrationError
    ? Math.max(baseSigma, config.calibrationError * 1.5)
    : baseSigma;
  const d = distance(gaze.point.x, gaze.point.y, region.center.x, region.center.y);
  const score = Math.exp(-(d * d) / (2 * sigma * sigma));

  return score;
}
