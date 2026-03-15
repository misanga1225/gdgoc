import type { Landmark, HeadPoseResult } from "./types.js";
import { LANDMARKS } from "./types.js";

const RAD_TO_DEG = 180 / Math.PI;

/**
 * 変換行列（4x4 column-major）からEuler角を抽出する
 * MediaPipe FaceLandmarkerが出力するfacialTransformationMatrixesを利用
 */
export function eulerFromMatrix(matrix: { data: Float32Array }): HeadPoseResult {
  const m = matrix.data;
  // column-major: m[row + col*4]
  // R[0][0]=m[0], R[1][0]=m[1], R[2][0]=m[2]
  // R[0][1]=m[4], R[1][1]=m[5], R[2][1]=m[6]
  // R[0][2]=m[8], R[1][2]=m[9], R[2][2]=m[10]

  const r00 = m[0], r10 = m[1], r20 = m[2];
  const r01 = m[4], r11 = m[5], r21 = m[6];
  const r02 = m[8], r12 = m[9], r22 = m[10];

  // Euler angles (Y-X-Z convention)
  const pitch = Math.asin(-clamp(r12, -1, 1)) * RAD_TO_DEG;
  const yaw = Math.atan2(r02, r22) * RAD_TO_DEG;
  const roll = Math.atan2(r10, r11) * RAD_TO_DEG;

  return { yaw, pitch, roll };
}

/**
 * ランドマークから幾何学的に頭部姿勢を推定する（フォールバック用）
 *
 * 使用ランドマーク: 鼻先(1), 右目内角(33), 左目内角(263), 顎先(152)
 */
export function estimateHeadPoseGeometric(landmarks: Landmark[]): HeadPoseResult {
  const nose = landmarks[LANDMARKS.NOSE_TIP];
  const rightEye = landmarks[LANDMARKS.RIGHT_EYE_INNER_CORNER];
  const leftEye = landmarks[LANDMARKS.LEFT_EYE_INNER_CORNER];

  // 両目の中点
  const eyeCenterX = (rightEye.x + leftEye.x) / 2;
  const eyeCenterY = (rightEye.y + leftEye.y) / 2;
  const eyeCenterZ = (rightEye.z + leftEye.z) / 2;

  // Yaw: 鼻先の左右オフセット
  const yaw = Math.atan2(
    nose.x - eyeCenterX,
    Math.abs(nose.z - eyeCenterZ) + 1e-6,
  ) * RAD_TO_DEG;

  // Pitch: 鼻先の上下オフセット
  const pitch = Math.atan2(
    nose.y - eyeCenterY,
    Math.abs(nose.z - eyeCenterZ) + 1e-6,
  ) * RAD_TO_DEG;

  // Roll: 両目の傾き
  const roll = Math.atan2(
    leftEye.y - rightEye.y,
    leftEye.x - rightEye.x,
  ) * RAD_TO_DEG;

  return { yaw, pitch, roll };
}

/**
 * 頭部姿勢を推定する
 * 変換行列が利用可能ならそちらを優先、なければ幾何学的推定にフォールバック
 */
export function estimateHeadPose(
  landmarks: Landmark[],
  transformMatrix?: { data: Float32Array } | null,
): HeadPoseResult {
  if (transformMatrix?.data) {
    return eulerFromMatrix(transformMatrix);
  }
  return estimateHeadPoseGeometric(landmarks);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
