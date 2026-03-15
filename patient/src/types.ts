/** 2D座標（正規化 [0,1] 座標系） */
export interface Point2D {
  x: number;
  y: number;
}

/** 注意対象の領域（Region of Interest） */
export interface Region {
  center: Point2D;
  radius: number; // 正規化座標系での半径
}

/** 視線入力データ */
export interface GazeInput {
  point: Point2D;       // 視線の推定座標
  faceDetected: boolean; // 顔が検出されているか
  confidence: number;    // 検出信頼度 [0,1]
}

/** マウス入力データ */
export interface MouseInput {
  point: Point2D;     // マウス座標
  dwellTime: number;  // 対象領域への滞在時間（秒）
  velocity: number;   // マウス速度（正規化座標/秒）
  confidence: number; // 信頼度 [0,1]
}

/** 頭部姿勢入力データ（角度は度単位） */
export interface HeadPoseInput {
  yaw: number;        // 左右回転（度）
  pitch: number;      // 上下回転（度）
  roll: number;       // 傾き（度）
  confidence: number; // 検出信頼度 [0,1]
}

/** 1フレーム分の全入力データ */
export interface FrameInput {
  gaze: GazeInput;
  mouse: MouseInput;
  headPose: HeadPoseInput;
  region: Region;     // 注目判定の対象領域
  dt: number;         // 前フレームからの経過時間（秒）
}

/** モデル出力 */
export interface AttentionOutput {
  attention: number;  // 最終注意度 [0,1]
  gazeScore: number;  // 視線スコア P_g
  mouseScore: number; // マウススコア P_m
  headScore: number;  // 頭部スコア P_h
  weights: {
    gaze: number;
    mouse: number;
    head: number;
  };
  rawAttention: number; // フィルタ前の A_raw
}

/** モデルの設定パラメータ */
export interface AttentionConfig {
  // 視線スコア
  gazeRegionRadius: number;  // 領域半径（σ算出用）
  gazeSigmaRatio: number;    // σ = ratio × radius

  // マウススコア
  mouseDistK: number;        // 距離半減値 K
  mouseDwellTau: number;     // 滞在時定数 τ_d（秒）
  mouseVelK: number;         // 速度減衰 K_v

  // 頭部スコア
  headYawThreshold: number;   // Yaw閾値（度）
  headPitchThreshold: number; // Pitch閾値（度）
  headRollThreshold: number;  // Roll閾値（度）
  headAxisWeights?: {          // 軸別重み（合計1.0、省略時は等重み）
    yaw: number;
    pitch: number;
    roll: number;
  };

  // 重み計算
  baseConfidence: {
    gaze: number;   // 視線基礎信頼度 c_gaze
    mouse: number;  // マウス基礎信頼度 c_mouse
    head: number;   // 頭部基礎信頼度 c_head
  };
  varianceWindowSec: number; // 分散計算の窓幅（秒）

  // 時間フィルタ
  temporalTau: number; // 一次遅れ系の時定数 τ（秒）

  // キャリブレーション品質（実行時に設定、省略時は固定sigma）
  calibrationError?: number; // LOO-CV平均誤差（正規化座標）
}
