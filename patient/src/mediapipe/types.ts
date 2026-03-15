/** MediaPipeの正規化ランドマーク（1点） */
export interface Landmark {
  x: number; // [0,1] 正規化座標
  y: number;
  z: number; // 相対深度
}

/** 虹彩トラッキング結果 */
export interface IrisResult {
  leftRatioX: number;  // 左目内の虹彩水平位置 [0,1]
  leftRatioY: number;  // 左目内の虹彩垂直位置 [0,1]
  rightRatioX: number; // 右目内の虹彩水平位置 [0,1]
  rightRatioY: number; // 右目内の虹彩垂直位置 [0,1]
  avgRatioX: number;   // 両目平均の水平比率（信頼度重み付き）
  avgRatioY: number;   // 両目平均の垂直比率（信頼度重み付き）
  interEyeDist: number;    // 両目内角間の距離（顔サイズ/距離プロキシ）
  avgNormEyeHeight: number; // 両目平均の正規化まぶた開き幅（eyeHeight/eyeWidth）
  isBlinking?: boolean;    // まばたき検出フラグ
  leftConfidence: number;  // 左目の信頼度 [0,1]
  rightConfidence: number; // 右目の信頼度 [0,1]
}

/** 頭部姿勢推定結果 */
export interface HeadPoseResult {
  yaw: number;   // 左右回転（度）正=右
  pitch: number; // 上下回転（度）正=下
  roll: number;  // 傾き（度）正=右傾き
}

/** 視線推定用の特徴ベクトル（15次元: 基本8 + 多項式6 + EAR-Y交互作用1） */
export type GazeFeatures = [
  leftRatioX: number,
  leftRatioY: number,
  rightRatioX: number,
  rightRatioY: number,
  headYaw: number,
  headPitch: number,
  interEyeDist: number,
  avgNormEyeHeight: number,
  // 2次の交互作用項（非線形性を捕捉）
  avgX2: number,
  avgY2: number,
  avgX_yaw: number,
  avgY_pitch: number,
  avgX_avgY: number,
  avgX_dist: number,
  // EAR-ratioY連成補正（下方視線時の眼開度変動による縦ノイズを補正）
  normEyeHeight_avgY: number,
];

/** ランドマークインデックス定数 */
export const LANDMARKS = {
  // 虹彩
  RIGHT_IRIS_CENTER: 468,
  RIGHT_IRIS: [468, 469, 470, 471, 472] as const,
  LEFT_IRIS_CENTER: 473,
  LEFT_IRIS: [473, 474, 475, 476, 477] as const,

  // 目の角
  RIGHT_EYE_INNER: 33,
  RIGHT_EYE_OUTER: 133,
  LEFT_EYE_INNER: 362,
  LEFT_EYE_OUTER: 263,

  // まぶた
  RIGHT_EYE_UPPER: 159,
  RIGHT_EYE_LOWER: 145,
  LEFT_EYE_UPPER: 386,
  LEFT_EYE_LOWER: 374,

  // 頭部姿勢推定用
  NOSE_TIP: 1,
  CHIN: 152,
  LEFT_EYE_INNER_CORNER: 263,
  RIGHT_EYE_INNER_CORNER: 33,
} as const;
