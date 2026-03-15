import type { MouseInput, Region, AttentionConfig } from "./types.js";

/** 2点間のユークリッド距離 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * マウス距離スコア
 * P_dist = 1 / (1 + d²/K)
 */
export function computeMouseDistScore(d: number, K: number): number {
  return 1 / (1 + (d * d) / K);
}

/**
 * マウス滞在時間スコア
 * P_dwell = 1 - exp(-t/τ_d)
 */
export function computeMouseDwellScore(dwellTime: number, tauD: number): number {
  return 1 - Math.exp(-dwellTime / tauD);
}

/**
 * マウス速度スコア
 * P_vel = exp(-v²/K_v)
 */
export function computeMouseVelScore(velocity: number, Kv: number): number {
  return Math.exp(-(velocity * velocity) / Kv);
}

/**
 * マウス総合スコア
 * P_m = P_dist × P_dwell × P_vel
 */
export function computeMouseScore(
  mouse: MouseInput,
  region: Region,
  config: AttentionConfig,
): number {
  const d = distance(mouse.point.x, mouse.point.y, region.center.x, region.center.y);

  const pDist = computeMouseDistScore(d, config.mouseDistK);
  const pDwell = computeMouseDwellScore(mouse.dwellTime, config.mouseDwellTau);
  const pVel = computeMouseVelScore(mouse.velocity, config.mouseVelK);

  return pDist * pDwell * pVel;
}
