/** MLP重みストレージ（フラット配列、キャッシュフレンドリー） */
export interface MLPWeights {
  W1: Float64Array; // [hidden1Dim × inputDim]
  b1: Float64Array; // [hidden1Dim]
  W2: Float64Array; // [hidden2Dim × hidden1Dim]
  b2: Float64Array; // [hidden2Dim]
  W3: Float64Array; // [outputDim × hidden2Dim]
  b3: Float64Array; // [outputDim]
}

/** MLPアーキテクチャ設定 */
export interface MLPConfig {
  inputDim: number;
  hidden1Dim: number;
  hidden2Dim: number;
  outputDim: number;
  learningRate: number;
  batchSize: number;
  epochs: number;
}

/** デフォルトMLP設定 */
export const DEFAULT_MLP_CONFIG: MLPConfig = {
  inputDim: 10,
  hidden1Dim: 16,
  hidden2Dim: 8,
  outputDim: 1,
  learningRate: 0.01,
  batchSize: 16,
  epochs: 50,
};

/** 垂直視線MLP用の学習サンプル */
export interface VerticalGazeSample {
  features: number[]; // 10次元
  targetY: number;    // 画面Y座標 [0,1]
}

/** 垂直特徴量の抽出結果（両目、1フレーム分） */
export interface VerticalGazeFeatures {
  features: number[]; // 10次元ベクトル
  avgEAR: number;     // まばたき検出用
  isBlinking: boolean;
}

/** まばたき検出設定 */
export interface BlinkConfig {
  earThreshold: number; // デフォルト 0.04
  holdFrames: number;   // まばたき後に値を保持するフレーム数（デフォルト 3）
}

/** デフォルトまばたき設定 */
export const DEFAULT_BLINK_CONFIG: BlinkConfig = {
  earThreshold: 0.04,
  holdFrames: 3,
};

/** フォワードパスのキャッシュ（逆伝播用） */
export interface ForwardCache {
  input: number[];
  z1: Float64Array;
  a1: Float64Array;
  z2: Float64Array;
  a2: Float64Array;
  z3: number;
  output: number;
}
