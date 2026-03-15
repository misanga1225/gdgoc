import type { AttentionConfig } from "./types.js";

/**
 * ヒューリスティックパラメータのデフォルト値
 *
 * 各値の根拠：
 * - gazeRegionRadius: Webカメラ精度 ~2-3度視角 → 正規化座標で0.12
 * - gazeSigmaRatio: CLAUDE.md仕様 σ = 0.6 × 領域半径
 * - mouseDistK: Huang et al. CHI 2012 — 平均視線-カーソル距離178px (1920px画面で~0.093正規化)
 * - mouseDwellTau: 固視研究の500msエンゲージメント閾値
 * - mouseVelK: 読書時P_vel≈1.0, 高速移動時P_vel≈0.14を実現
 * - headYawThreshold: 画面視聴時の快適範囲 (Zhang & Abdel-Aty 2022)
 * - headPitchThreshold: 垂直視聴範囲
 * - headRollThreshold: 姿勢安定性指標 (Euro NCAP)
 * - baseConfidence: モダリティ固有の計測信頼性
 * - varianceWindowSec: 1-2固視サイクルをカバー
 * - temporalTau: 応答性と安定性のバランス (300ms)
 */
export const DEFAULT_CONFIG: AttentionConfig = {
  gazeRegionRadius: 0.12,
  gazeSigmaRatio: 0.6,

  mouseDistK: 0.01,
  mouseDwellTau: 0.5,
  mouseVelK: 0.5,

  headYawThreshold: 35,
  headPitchThreshold: 25,
  headRollThreshold: 20,
  headAxisWeights: { yaw: 0.5, pitch: 0.3, roll: 0.2 },

  baseConfidence: {
    gaze: 0.7,
    mouse: 0.9,
    head: 0.8,
  },
  varianceWindowSec: 0.5,

  temporalTau: 0.3,
};
