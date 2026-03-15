/**
 * リッジ回帰（L2正則化付き線形回帰）
 *
 * y = Xw + b を解く
 * w = (X^T X + λI)^{-1} X^T y
 *
 * 小行列（6×6程度）向けの純TypeScript実装
 */
export class RidgeRegression {
  private weightsX: number[] | null = null;
  private weightsY: number[] | null = null;
  private biasX = 0;
  private biasY = 0;
  private featureDim = 0;

  constructor(private lambda: number = 1.0) {}

  /**
   * 学習データからモデルを訓練する
   * @param X 特徴行列 [nSamples][featureDim]
   * @param Y 目標値 [nSamples][2] (スクリーンx, y)
   */
  fit(X: number[][], Y: number[][]): void {
    const n = X.length;
    if (n === 0) throw new Error("No training data");
    const d = X[0].length;
    this.featureDim = d;

    // バイアス項を加えたXa [n][d+1] (最後の列が1)
    const Xa = X.map((row) => [...row, 1]);
    const da = d + 1;

    // X^T X + λI  [da × da]
    const XtX = matMul(transpose(Xa, n, da), Xa, da, n, da);
    for (let i = 0; i < da; i++) {
      XtX[i * da + i] += this.lambda;
    }
    // バイアス項には正則化を適用しない
    XtX[(da - 1) * da + (da - 1)] -= this.lambda;

    // (X^T X + λI)^{-1}
    const XtXinv = invertMatrix(XtX, da);

    // X^T y
    const Yx = Y.map((row) => row[0]);
    const Yy = Y.map((row) => row[1]);

    const XtYx = matVecMul(transpose(Xa, n, da), Yx, da, n);
    const XtYy = matVecMul(transpose(Xa, n, da), Yy, da, n);

    // w = (X^T X + λI)^{-1} X^T y
    const wx = matVecMul(XtXinv, XtYx, da, da);
    const wy = matVecMul(XtXinv, XtYy, da, da);

    this.weightsX = wx.slice(0, d);
    this.weightsY = wy.slice(0, d);
    this.biasX = wx[d];
    this.biasY = wy[d];
  }

  /**
   * 予測する
   * @param features 特徴ベクトル [featureDim]
   * @returns [x, y] スクリーン座標
   */
  predict(features: number[]): [number, number] {
    if (!this.weightsX || !this.weightsY) {
      throw new Error("Model not trained");
    }

    let x = this.biasX;
    let y = this.biasY;
    for (let i = 0; i < this.featureDim; i++) {
      x += this.weightsX[i] * features[i];
      y += this.weightsY[i] * features[i];
    }
    return [x, y];
  }

  get isTrained(): boolean {
    return this.weightsX !== null;
  }
}

// --- 小行列演算ユーティリティ ---

/** 行列の転置 [rows×cols] → [cols×rows] (1次元配列) */
function transpose(A: number[][], rows: number, cols: number): number[] {
  const result = new Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j * rows + i] = A[i][j];
    }
  }
  return result;
}

/** 行列乗算 A[rA×cA] × B[rB×cB] → C[rA×cB]  (1次元配列) */
function matMul(
  A: number[], B: number[][],
  rA: number, cA: number, cB: number,
): number[] {
  const result = new Array(rA * cB).fill(0);
  for (let i = 0; i < rA; i++) {
    for (let j = 0; j < cB; j++) {
      let sum = 0;
      for (let k = 0; k < cA; k++) {
        sum += A[i * cA + k] * B[k][j];
      }
      result[i * cB + j] = sum;
    }
  }
  return result;
}

/** 行列×ベクトル A[rows×cols] × v[cols] → result[rows] */
function matVecMul(A: number[], v: number[], rows: number, cols: number): number[] {
  const result = new Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let sum = 0;
    for (let j = 0; j < cols; j++) {
      sum += A[i * cols + j] * v[j];
    }
    result[i] = sum;
  }
  return result;
}

/** ガウス消去法による逆行列 (n×n, 1次元配列) */
function invertMatrix(M: number[], n: number): number[] {
  // 拡大行列 [M | I]
  const aug = new Array(n * 2 * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      aug[i * 2 * n + j] = M[i * n + j];
    }
    aug[i * 2 * n + n + i] = 1;
  }

  const w = 2 * n;

  // 前進消去（部分ピボット付き）
  for (let col = 0; col < n; col++) {
    // ピボット選択
    let maxVal = Math.abs(aug[col * w + col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row * w + col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
    }

    if (maxVal < 1e-12) throw new Error("Matrix is singular");

    // 行の交換
    if (maxRow !== col) {
      for (let j = 0; j < w; j++) {
        const tmp = aug[col * w + j];
        aug[col * w + j] = aug[maxRow * w + j];
        aug[maxRow * w + j] = tmp;
      }
    }

    // ピボット行の正規化
    const pivot = aug[col * w + col];
    for (let j = 0; j < w; j++) {
      aug[col * w + j] /= pivot;
    }

    // 他の行を消去
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row * w + col];
      for (let j = 0; j < w; j++) {
        aug[row * w + j] -= factor * aug[col * w + j];
      }
    }
  }

  // 右半分が逆行列
  const inv = new Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      inv[i * n + j] = aug[i * w + n + j];
    }
  }
  return inv;
}
