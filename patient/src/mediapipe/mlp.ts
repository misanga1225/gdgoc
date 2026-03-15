import type { MLPWeights, MLPConfig, ForwardCache, VerticalGazeSample } from "./vertical-gaze-types.js";

// --- 決定論的PRNG (xorshift32) ---

function xorshift32(state: { s: number }): number {
  let x = state.s;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.s = x >>> 0;
  // [0,1) の一様分布に変換
  return (state.s & 0x7fffffff) / 0x7fffffff;
}

// --- 重み初期化 ---

/**
 * Xavier/Glorot uniform 初期化
 * limit = sqrt(6 / (fan_in + fan_out))
 */
export function initializeWeights(config: MLPConfig, seed: number = 42): MLPWeights {
  const state = { s: seed >>> 0 || 1 };

  function xavierInit(fanIn: number, fanOut: number, size: number): Float64Array {
    const limit = Math.sqrt(6 / (fanIn + fanOut));
    const arr = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      arr[i] = (xorshift32(state) * 2 - 1) * limit;
    }
    return arr;
  }

  return {
    W1: xavierInit(config.inputDim, config.hidden1Dim, config.hidden1Dim * config.inputDim),
    b1: new Float64Array(config.hidden1Dim), // ゼロ初期化
    W2: xavierInit(config.hidden1Dim, config.hidden2Dim, config.hidden2Dim * config.hidden1Dim),
    b2: new Float64Array(config.hidden2Dim),
    W3: xavierInit(config.hidden2Dim, config.outputDim, config.outputDim * config.hidden2Dim),
    b3: new Float64Array(config.outputDim),
  };
}

// --- フォワードパス ---

/** 推論のみ（キャッシュなし） */
export function forward(input: number[], weights: MLPWeights, config: MLPConfig): number {
  const { inputDim, hidden1Dim, hidden2Dim } = config;

  // Layer 1: z1 = W1 * input + b1, a1 = relu(z1)
  const a1 = new Float64Array(hidden1Dim);
  for (let i = 0; i < hidden1Dim; i++) {
    let sum = weights.b1[i];
    for (let j = 0; j < inputDim; j++) {
      sum += weights.W1[i * inputDim + j] * input[j];
    }
    a1[i] = sum > 0 ? sum : 0; // ReLU
  }

  // Layer 2: z2 = W2 * a1 + b2, a2 = relu(z2)
  const a2 = new Float64Array(hidden2Dim);
  for (let i = 0; i < hidden2Dim; i++) {
    let sum = weights.b2[i];
    for (let j = 0; j < hidden1Dim; j++) {
      sum += weights.W2[i * hidden1Dim + j] * a1[j];
    }
    a2[i] = sum > 0 ? sum : 0; // ReLU
  }

  // Output: z3 = W3 * a2 + b3 (Linear, Sigmoidなし)
  let z3 = weights.b3[0];
  for (let j = 0; j < hidden2Dim; j++) {
    z3 += weights.W3[j] * a2[j];
  }

  return z3;
}

/** フォワードパス（キャッシュ付き、逆伝播用） */
export function forwardWithCache(
  input: number[],
  weights: MLPWeights,
  config: MLPConfig,
): ForwardCache {
  const { inputDim, hidden1Dim, hidden2Dim } = config;

  const z1 = new Float64Array(hidden1Dim);
  const a1 = new Float64Array(hidden1Dim);
  for (let i = 0; i < hidden1Dim; i++) {
    let sum = weights.b1[i];
    for (let j = 0; j < inputDim; j++) {
      sum += weights.W1[i * inputDim + j] * input[j];
    }
    z1[i] = sum;
    a1[i] = sum > 0 ? sum : 0;
  }

  const z2 = new Float64Array(hidden2Dim);
  const a2 = new Float64Array(hidden2Dim);
  for (let i = 0; i < hidden2Dim; i++) {
    let sum = weights.b2[i];
    for (let j = 0; j < hidden1Dim; j++) {
      sum += weights.W2[i * hidden1Dim + j] * a1[j];
    }
    z2[i] = sum;
    a2[i] = sum > 0 ? sum : 0;
  }

  let z3 = weights.b3[0];
  for (let j = 0; j < hidden2Dim; j++) {
    z3 += weights.W3[j] * a2[j];
  }

  return { input: [...input], z1, a1, z2, a2, z3, output: z3 };
}

// --- 逆伝播 ---

export interface MLPGradients {
  dW1: Float64Array;
  db1: Float64Array;
  dW2: Float64Array;
  db2: Float64Array;
  dW3: Float64Array;
  db3: Float64Array;
}

/** 1サンプルの逆伝播（MSE損失） */
export function backward(
  cache: ForwardCache,
  target: number,
  weights: MLPWeights,
  config: MLPConfig,
): MLPGradients {
  const { inputDim, hidden1Dim, hidden2Dim } = config;

  // dL/doutput = 2 * (output - target) （MSE微分）
  const dOutput = 2 * (cache.output - target);

  // 出力層はLinear → dz3 = dOutput
  const dz3 = dOutput;

  // 出力層の勾配
  const dW3 = new Float64Array(hidden2Dim);
  for (let j = 0; j < hidden2Dim; j++) {
    dW3[j] = dz3 * cache.a2[j];
  }
  const db3 = new Float64Array(1);
  db3[0] = dz3;

  // Layer 2 逆伝播
  const da2 = new Float64Array(hidden2Dim);
  for (let i = 0; i < hidden2Dim; i++) {
    da2[i] = dz3 * weights.W3[i];
  }
  const dz2 = new Float64Array(hidden2Dim);
  for (let i = 0; i < hidden2Dim; i++) {
    dz2[i] = da2[i] * (cache.z2[i] > 0 ? 1 : 0); // ReLU微分
  }

  const dW2 = new Float64Array(hidden2Dim * hidden1Dim);
  const db2 = new Float64Array(hidden2Dim);
  for (let i = 0; i < hidden2Dim; i++) {
    db2[i] = dz2[i];
    for (let j = 0; j < hidden1Dim; j++) {
      dW2[i * hidden1Dim + j] = dz2[i] * cache.a1[j];
    }
  }

  // Layer 1 逆伝播
  const da1 = new Float64Array(hidden1Dim);
  for (let j = 0; j < hidden1Dim; j++) {
    let sum = 0;
    for (let i = 0; i < hidden2Dim; i++) {
      sum += dz2[i] * weights.W2[i * hidden1Dim + j];
    }
    da1[j] = sum;
  }
  const dz1 = new Float64Array(hidden1Dim);
  for (let i = 0; i < hidden1Dim; i++) {
    dz1[i] = da1[i] * (cache.z1[i] > 0 ? 1 : 0);
  }

  const dW1 = new Float64Array(hidden1Dim * inputDim);
  const db1 = new Float64Array(hidden1Dim);
  for (let i = 0; i < hidden1Dim; i++) {
    db1[i] = dz1[i];
    for (let j = 0; j < inputDim; j++) {
      dW1[i * inputDim + j] = dz1[i] * cache.input[j];
    }
  }

  return { dW1, db1, dW2, db2, dW3, db3 };
}

// --- 学習 ---

/** 勾配を重みに適用（SGDステップ） */
function applyGradients(
  weights: MLPWeights,
  grads: MLPGradients,
  lr: number,
  batchSize: number,
): void {
  const scale = lr / batchSize;
  for (let i = 0; i < weights.W1.length; i++) weights.W1[i] -= scale * grads.dW1[i];
  for (let i = 0; i < weights.b1.length; i++) weights.b1[i] -= scale * grads.db1[i];
  for (let i = 0; i < weights.W2.length; i++) weights.W2[i] -= scale * grads.dW2[i];
  for (let i = 0; i < weights.b2.length; i++) weights.b2[i] -= scale * grads.db2[i];
  for (let i = 0; i < weights.W3.length; i++) weights.W3[i] -= scale * grads.dW3[i];
  for (let i = 0; i < weights.b3.length; i++) weights.b3[i] -= scale * grads.db3[i];
}

/** 勾配を累積する */
function accumulateGradients(acc: MLPGradients, grads: MLPGradients): void {
  for (let i = 0; i < acc.dW1.length; i++) acc.dW1[i] += grads.dW1[i];
  for (let i = 0; i < acc.db1.length; i++) acc.db1[i] += grads.db1[i];
  for (let i = 0; i < acc.dW2.length; i++) acc.dW2[i] += grads.dW2[i];
  for (let i = 0; i < acc.db2.length; i++) acc.db2[i] += grads.db2[i];
  for (let i = 0; i < acc.dW3.length; i++) acc.dW3[i] += grads.dW3[i];
  for (let i = 0; i < acc.db3.length; i++) acc.db3[i] += grads.db3[i];
}

/** ゼロ勾配を作成する */
function zeroGradients(config: MLPConfig): MLPGradients {
  return {
    dW1: new Float64Array(config.hidden1Dim * config.inputDim),
    db1: new Float64Array(config.hidden1Dim),
    dW2: new Float64Array(config.hidden2Dim * config.hidden1Dim),
    db2: new Float64Array(config.hidden2Dim),
    dW3: new Float64Array(config.outputDim * config.hidden2Dim),
    db3: new Float64Array(config.outputDim),
  };
}

/** Fisher-Yates シャッフル */
function shuffle<T>(arr: T[], state: { s: number }): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(xorshift32(state) * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// --- データ拡張 ---

/**
 * 擬似データ拡張：各サンプルに ±1%, ±2%, ±3% のノイズを付加
 * 150サンプル → 900サンプルに増幅
 */
export function augmentSamples(samples: VerticalGazeSample[]): VerticalGazeSample[] {
  const noiseRatios = [0.01, -0.01, 0.02, -0.02, 0.03, -0.03];
  const augmented: VerticalGazeSample[] = [];
  for (const s of samples) {
    for (const r of noiseRatios) {
      augmented.push({
        features: s.features.map((f) => f * (1 + r)),
        targetY: s.targetY,
      });
    }
  }
  return augmented;
}

/**
 * 全学習ループ
 * @returns 最終損失
 */
export function train(
  samples: VerticalGazeSample[],
  weights: MLPWeights,
  config: MLPConfig,
): number {
  const allSamples = [...samples, ...augmentSamples(samples)];
  const state = { s: 123 };
  let lastLoss = Infinity;

  for (let epoch = 0; epoch < config.epochs; epoch++) {
    shuffle(allSamples, state);

    let epochLoss = 0;
    let epochCount = 0;

    for (let batchStart = 0; batchStart < allSamples.length; batchStart += config.batchSize) {
      const batchEnd = Math.min(batchStart + config.batchSize, allSamples.length);
      const batchLen = batchEnd - batchStart;

      const accGrads = zeroGradients(config);
      let batchLoss = 0;

      for (let i = batchStart; i < batchEnd; i++) {
        const sample = allSamples[i];
        const cache = forwardWithCache(sample.features, weights, config);
        const loss = (cache.output - sample.targetY) ** 2;
        batchLoss += loss;

        const grads = backward(cache, sample.targetY, weights, config);
        accumulateGradients(accGrads, grads);
      }

      applyGradients(weights, accGrads, config.learningRate, batchLen);
      epochLoss += batchLoss;
      epochCount += batchLen;
    }

    lastLoss = epochLoss / epochCount;
  }

  return lastLoss;
}

// --- シリアライズ ---

interface SerializedWeights {
  W1: number[];
  b1: number[];
  W2: number[];
  b2: number[];
  W3: number[];
  b3: number[];
}

export function serializeWeights(weights: MLPWeights): string {
  const obj: SerializedWeights = {
    W1: Array.from(weights.W1),
    b1: Array.from(weights.b1),
    W2: Array.from(weights.W2),
    b2: Array.from(weights.b2),
    W3: Array.from(weights.W3),
    b3: Array.from(weights.b3),
  };
  return JSON.stringify(obj);
}

export function deserializeWeights(json: string): MLPWeights {
  const obj: SerializedWeights = JSON.parse(json);
  return {
    W1: new Float64Array(obj.W1),
    b1: new Float64Array(obj.b1),
    W2: new Float64Array(obj.W2),
    b2: new Float64Array(obj.b2),
    W3: new Float64Array(obj.W3),
    b3: new Float64Array(obj.b3),
  };
}
