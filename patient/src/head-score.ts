import type { HeadPoseInput, AttentionConfig } from "./types.js";

/**
 * 単軸の姿勢スコア
 * f(θ, T) = cos²((π/2) × min(|θ|/T, 1))
 */
export function axisScore(angleDeg: number, threshold: number): number {
  const ratio = Math.min(Math.abs(angleDeg) / threshold, 1);
  const cosVal = Math.cos((Math.PI / 2) * ratio);
  return cosVal * cosVal;
}

/**
 * 頭部姿勢スコア
 * P_h = w_yaw * f(yaw) + w_pitch * f(pitch) + w_roll * f(roll)
 * デフォルト重み: yaw=0.5, pitch=0.3, roll=0.2（yawが最も画面離脱を示唆）
 */
export function computeHeadScore(
  headPose: HeadPoseInput,
  config: AttentionConfig,
): number {
  const fYaw = axisScore(headPose.yaw, config.headYawThreshold);
  const fPitch = axisScore(headPose.pitch, config.headPitchThreshold);
  const fRoll = axisScore(headPose.roll, config.headRollThreshold);

  const w = config.headAxisWeights;
  if (w) {
    return w.yaw * fYaw + w.pitch * fPitch + w.roll * fRoll;
  }
  return (fYaw + fPitch + fRoll) / 3;
}
