import type { Landmark, IrisResult } from "./types.js";
import { LANDMARKS } from "./types.js";
import type { VerticalGazeRefiner } from "./vertical-gaze-mlp.js";

/**
 * 虹彩ランドマーク群の重み付き重心を計算
 * 中心点（index 0）は周囲4点より安定しているため重み2.0を付与
 */
function centroid(points: Landmark[]): Landmark {
  let x = 0, y = 0, z = 0, totalW = 0;
  for (let i = 0; i < points.length; i++) {
    const w = i === 0 ? 2.0 : 1.0; // 中心ランドマークの重み
    x += points[i].x * w;
    y += points[i].y * w;
    z += points[i].z * w;
    totalW += w;
  }
  return { x: x / totalW, y: y / totalW, z: z / totalW };
}

/**
 * 虹彩の目幅内位置比率を計算する
 *
 * iris_ratio = (iris_center - inner_corner) / (outer_corner - inner_corner)
 * 結果は [0,1] で、0.5が正面を見ている状態に近い
 */
function computeIrisRatio(
  irisCenter: Landmark,
  innerCorner: Landmark,
  outerCorner: Landmark,
  upperLid: Landmark,
  lowerLid: Landmark,
): { ratioX: number; ratioY: number } {
  // 水平比率
  const eyeWidth = outerCorner.x - innerCorner.x;
  const ratioX = eyeWidth !== 0
    ? (irisCenter.x - innerCorner.x) / eyeWidth
    : 0.5;

  // 垂直比率
  const eyeHeight = lowerLid.y - upperLid.y;
  const ratioY = eyeHeight !== 0
    ? (irisCenter.y - upperLid.y) / eyeHeight
    : 0.5;

  return { ratioX, ratioY };
}

/**
 * 478ランドマークから虹彩の位置比率を抽出する
 *
 * @param verticalRefiner オプショナル。MLPベースの垂直視線補正器。
 *   学習済みの場合、ratioYを補正してノイズ耐性を向上させる。
 */
export function extractIrisData(
  landmarks: Landmark[],
  verticalRefiner?: VerticalGazeRefiner | null,
): IrisResult | null {
  if (landmarks.length < 478) return null;

  // 5つの虹彩ランドマークの重心を使用（単一点よりジッタに強い）
  const rightIris = centroid(LANDMARKS.RIGHT_IRIS.map(i => landmarks[i]));
  const leftIris = centroid(LANDMARKS.LEFT_IRIS.map(i => landmarks[i]));

  const right = computeIrisRatio(
    rightIris,
    landmarks[LANDMARKS.RIGHT_EYE_INNER],
    landmarks[LANDMARKS.RIGHT_EYE_OUTER],
    landmarks[LANDMARKS.RIGHT_EYE_UPPER],
    landmarks[LANDMARKS.RIGHT_EYE_LOWER],
  );

  const left = computeIrisRatio(
    leftIris,
    landmarks[LANDMARKS.LEFT_EYE_INNER],
    landmarks[LANDMARKS.LEFT_EYE_OUTER],
    landmarks[LANDMARKS.LEFT_EYE_UPPER],
    landmarks[LANDMARKS.LEFT_EYE_LOWER],
  );

  // 頭部ロール補正: 頭の傾きによるX/Y軸の混在を逆回転で補正
  const rightInnerForRoll = landmarks[LANDMARKS.RIGHT_EYE_INNER];
  const leftInnerForRoll = landmarks[LANDMARKS.LEFT_EYE_INNER];
  const rollRad = Math.atan2(
    leftInnerForRoll.y - rightInnerForRoll.y,
    leftInnerForRoll.x - rightInnerForRoll.x,
  );
  const cosR = Math.cos(-rollRad);
  const sinR = Math.sin(-rollRad);

  function rollCorrect(ratioX: number, ratioY: number) {
    const dx = ratioX - 0.5;
    const dy = ratioY - 0.5;
    return {
      ratioX: dx * cosR - dy * sinR + 0.5,
      ratioY: dx * sinR + dy * cosR + 0.5,
    };
  }

  const rightCorrected = rollCorrect(right.ratioX, right.ratioY);
  const leftCorrected = rollCorrect(left.ratioX, left.ratioY);

  let leftRatioX = leftCorrected.ratioX;
  let rightRatioX = rightCorrected.ratioX;
  let leftRatioY = leftCorrected.ratioY;
  let rightRatioY = rightCorrected.ratioY;
  let isBlinking = false;

  // MLP補正が学習済みの場合のみ、ratioYを置き換える
  if (verticalRefiner?.isTrained) {
    const refined = verticalRefiner.refine(landmarks);
    leftRatioY = refined.ratioY;
    rightRatioY = refined.ratioY;
    isBlinking = refined.isBlinking;
  }

  // 両目内角間の距離（顔サイズ/距離のプロキシ）
  const rightInner = landmarks[LANDMARKS.RIGHT_EYE_INNER];
  const leftInner = landmarks[LANDMARKS.LEFT_EYE_INNER];
  const dx = leftInner.x - rightInner.x;
  const dy = leftInner.y - rightInner.y;
  const rawInterEyeDist = Math.sqrt(dx * dx + dy * dy);

  // 正規化まぶた開き幅（eyeHeight / eyeWidth）の両目平均
  // 下を見ると目が閉じ気味になるため、縦方向視線と相関する独立な特徴量
  const rightEyeWidth = Math.abs(landmarks[LANDMARKS.RIGHT_EYE_OUTER].x - landmarks[LANDMARKS.RIGHT_EYE_INNER].x);
  const rightEyeHeight = landmarks[LANDMARKS.RIGHT_EYE_LOWER].y - landmarks[LANDMARKS.RIGHT_EYE_UPPER].y;
  const leftEyeWidth = Math.abs(landmarks[LANDMARKS.LEFT_EYE_OUTER].x - landmarks[LANDMARKS.LEFT_EYE_INNER].x);
  const leftEyeHeight = landmarks[LANDMARKS.LEFT_EYE_LOWER].y - landmarks[LANDMARKS.LEFT_EYE_UPPER].y;
  const rightNormEH = rightEyeWidth > 1e-6 ? rightEyeHeight / rightEyeWidth : 0;
  const leftNormEH = leftEyeWidth > 1e-6 ? leftEyeHeight / leftEyeWidth : 0;
  const avgNormEyeHeight = (leftNormEH + rightNormEH) / 2;

  // interEyeDist を目の幅で正規化（カメラ解像度・顔位置非依存）
  const avgEyeWidth = (rightEyeWidth + leftEyeWidth) / 2;
  const interEyeDist = avgEyeWidth > 1e-6
    ? rawInterEyeDist / avgEyeWidth
    : rawInterEyeDist;

  // 片目ごとの信頼度を計算
  // 1. 開眼度ベース: 正規化まぶた幅が小さいほど信頼度が低い
  const REF_NORM_EH = 0.35; // 典型的な開眼時の正規化まぶた幅
  const leftEarConf = Math.min(leftNormEH / REF_NORM_EH, 1.0);
  const rightEarConf = Math.min(rightNormEH / REF_NORM_EH, 1.0);

  // 2. 短縮投影検出: 目の内角と外角のz深度差が大きいほど頭部が回転している
  const leftZRange = Math.abs(landmarks[LANDMARKS.LEFT_EYE_INNER].z - landmarks[LANDMARKS.LEFT_EYE_OUTER].z);
  const rightZRange = Math.abs(landmarks[LANDMARKS.RIGHT_EYE_INNER].z - landmarks[LANDMARKS.RIGHT_EYE_OUTER].z);
  const Z_RANGE_THRESHOLD = 0.03; // この値以上で信頼度がゼロに近づく
  const leftForeshortenConf = Math.max(0, 1.0 - leftZRange / Z_RANGE_THRESHOLD);
  const rightForeshortenConf = Math.max(0, 1.0 - rightZRange / Z_RANGE_THRESHOLD);

  // 総合信頼度
  const leftConfidence = leftEarConf * leftForeshortenConf;
  const rightConfidence = rightEarConf * rightForeshortenConf;

  // 信頼度重み付き両眼平均（片目の信頼度が低い場合にもう一方を重視）
  const MIN_CONF = 0.1; // ゼロ除算防止
  const wL = Math.max(leftConfidence, MIN_CONF);
  const wR = Math.max(rightConfidence, MIN_CONF);
  const wSum = wL + wR;

  return {
    leftRatioX,
    leftRatioY,
    rightRatioX,
    rightRatioY,
    avgRatioX: (wL * leftRatioX + wR * rightRatioX) / wSum,
    avgRatioY: (wL * leftRatioY + wR * rightRatioY) / wSum,
    interEyeDist,
    avgNormEyeHeight,
    isBlinking,
    leftConfidence,
    rightConfidence,
  };
}
