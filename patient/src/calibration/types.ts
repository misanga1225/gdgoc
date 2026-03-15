import type { Point2D } from "../types.js";
import type { GazeFeatures } from "../mediapipe/types.js";

/** キャリブレーション点 */
export interface CalibrationPoint {
  screenPos: Point2D; // 画面上の表示位置 [0,1]
  samples: GazeFeatures[]; // 収集された特徴ベクトル
}

/** キャリブレーション状態 */
export type CalibrationState =
  | { phase: "idle" }
  | { phase: "collecting"; pointIndex: number; elapsed: number }
  | { phase: "computing" }
  | { phase: "done"; error: number }; // error = 平均誤差

/** キャリブレーション設定 */
export interface CalibrationConfig {
  gridSize: number; // グリッドサイズ（3なら3×3=9点）
  gridRows?: number; // 行数（省略時=gridSize）Y軸カバレッジ向上に使用
  gridCols?: number; // 列数（省略時=gridSize）
  extraPoints?: Point2D[]; // グリッドに追加する補助点（中央精度向上など）
  dwellTimeSec: number; // 各点の注視時間（秒）
  warmupTimeSec: number; // 安定化待ち時間（秒）
  margin: number; // 画面端からのマージン [0,1]
  lensGamma?: number; // 端部伸張ガンマ: 1.0=無効, <1.0=端を外側に伸張
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  gridSize: 3,
  gridRows: 4, // Y位置: {0.02, 0.35, 0.67, 0.98} — ratioY可動域(~0.2)に対してSNR確保
  gridCols: 4, // X位置: {0.02, 0.35, 0.67, 0.98} — X可動域(~0.3)は余裕あり、端精度向上
  extraPoints: [
    { x: 0.45, y: 0.45 },
    { x: 0.55, y: 0.45 },
    { x: 0.45, y: 0.55 },
    { x: 0.55, y: 0.55 },
  ],
  dwellTimeSec: 1.5,
  warmupTimeSec: 0.8,
  margin: 0.02,
  lensGamma: 0.75,
};
