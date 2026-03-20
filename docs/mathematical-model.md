## 1. 注意スコアの算出（3モダリティ融合）

数理モデル**MATCH**はデバイスがPCの場合、視線・マウス・頭部姿勢の3モダリティを動的重み付きで融合し、時間フィルタを適用して注意スコア $A \in [0,1]$ を算出する。

### 1.1 融合式

$$
A_{\text{raw}} = \frac{w_g \cdot P_g + w_m \cdot P_m + w_h \cdot P_h}{w_g + w_m + w_h}
$$

- $P_g$: 視線スコア（ガウス空間尤度）
- $P_m$: マウススコア（3因子合成）
- $P_h$: 頭部姿勢スコア（3軸重み付き）
- $w_i$: 各モダリティの動的重み

全重みが 0 の場合は $A_{\text{raw}} = 0.5$ にフォールバックする。

### 1.2 時間フィルタ（1次遅れ系）

$$
A \leftarrow A + \alpha \cdot (A_{\text{raw}} - A), \quad \alpha = \min\!\left(\frac{\Delta t}{\tau}, 1\right)
$$

| パラメータ | 値 |
|---|---|
| $\tau$ | 0.3 秒 |

---

## 2. 各モダリティのスコア算出

### 2.1 視線スコア $P_g$（ガウス空間尤度）

$$
P_g = \exp\!\left(-\frac{d^2}{2\sigma^2}\right)
$$

$$
\sigma = \max(\sigma_{\text{base}},\ \text{calibration\_error} \times 1.5), \quad \sigma_{\text{base}} = r_\sigma \times R
$$

- $d$: 視線点と対象領域中心のユークリッド距離（正規化座標）
- $R$: 領域半径
- $r_\sigma$: ガウス幅比率

| パラメータ | 値 |
|---|---|
| $r_\sigma$ | 0.6 |
| $R$ | 0.12 |

### 2.2 マウススコア $P_m$（3因子合成）

$$
P_m = P_{\text{dist}} \times P_{\text{dwell}} \times P_{\text{vel}}
$$

**距離成分**（逆二乗型）:

$$
P_{\text{dist}} = \frac{1}{1 + d^2 / K_d}
$$

**滞留時間成分**（指数飽和）:

$$
P_{\text{dwell}} = 1 - \exp\!\left(-\frac{t}{\tau_d}\right)
$$

**速度成分**（ガウス減衰）:

$$
P_{\text{vel}} = \exp\!\left(-\frac{v_{\text{eff}}^2}{K_v}\right)
$$

マウスが 100ms 以上静止している場合、実効速度に減衰を適用する:

$$
v_{\text{eff}} = v \cdot \exp(-5 \cdot t_{\text{stationary}})
$$

| パラメータ | 値 |
|---|---|
| $K_d$ | 0.01（Huang et al. CHI 2012 に基づく） |
| $\tau_d$ | 0.5 秒 |
| $K_v$ | 0.5 |

### 2.3 頭部姿勢スコア $P_h$（3軸重み付き）

各軸のスコアは cos² 関数で算出する:

$$
f(\theta, T) = \cos^2\!\left(\frac{\pi}{2} \cdot \min\!\left(\frac{|\theta|}{T}, 1\right)\right)
$$

$$
P_h = w_{\text{yaw}} \cdot f(\text{yaw}, T_{\text{yaw}}) + w_{\text{pitch}} \cdot f(\text{pitch}, T_{\text{pitch}}) + w_{\text{roll}} \cdot f(\text{roll}, T_{\text{roll}})
$$

| 軸 | 重み $w$ | 閾値 $T$ |
|---|---|---|
| yaw | 0.5 | 35° |
| pitch | 0.3 | 25° |
| roll | 0.2 | 20° |

---

## 3. 動的重み

各モダリティの重みは、信頼度とスコア安定性から算出する:

$$
w_i = \frac{c_i}{1 + \sigma_i^2}
$$

- $c_i = \text{detected\_confidence}_i \times \text{base\_confidence}_i$
- $\sigma_i^2$: スライディングウィンドウ内のスコア分散

| パラメータ | 値 |
|---|---|
| base\_confidence（gaze） | 0.7 |
| base\_confidence（mouse） | 0.9 |
| base\_confidence（head） | 0.8 |
| 分散ウィンドウ | 0.5 秒 |

---

## 4. 虹彩追跡と特徴量抽出

### 4.1 虹彩位置比率

$$
\text{iris\_ratio}_X = \frac{x_{\text{iris}} - x_{\text{inner}}}{x_{\text{outer}} - x_{\text{inner}}}, \quad
\text{iris\_ratio}_Y = \frac{y_{\text{iris}} - y_{\text{upper}}}{y_{\text{lower}} - y_{\text{upper}}}
$$

結果は $[0,1]$ に正規化され、0.5 が正面注視に対応する。

### 4.2 両眼重心

$$
\text{ratio} = \frac{w_L \cdot \text{ratio}_L + w_R \cdot \text{ratio}_R}{w_L + w_R}, \quad w_i = \max(c_i, 0.1)
$$

### 4.3 眼の信頼度

$$
c_{\text{EAR}} = \min\!\left(\frac{\text{norm\_eye\_height}}{0.35},\ 1\right), \quad
c_z = \max(0,\ 1 - z_{\text{range}} / 0.03)
$$

$$
c = c_{\text{EAR}} \times c_z
$$

---

## 5. 頭部姿勢推定

MediaPipe の変換行列（列優先）からオイラー角を抽出する:

$$
\text{pitch} = \arcsin(-R_{1,2}), \quad
\text{yaw} = \text{atan2}(R_{0,2},\ R_{2,2}), \quad
\text{roll} = \text{atan2}(R_{1,0},\ R_{1,1})
$$

**角度依存の信頼度低減**:

$$
\text{reliability} = \max\!\left(0.4,\ \cos\!\left(\frac{\pi}{2} \cdot \frac{|\text{yaw}|}{45°}\right) \cdot \cos\!\left(\frac{\pi}{2} \cdot \frac{|\text{pitch}|}{35°}\right)\right)
$$

---

## 6. キャリブレーション

### 6.1 リッジ回帰

15次元の特徴ベクトルからスクリーン座標を予測する:

$$
\hat{y} = X \mathbf{w} + b, \quad \mathbf{w} = (X^T X + \lambda I)^{-1} X^T \mathbf{y}
$$

**特徴ベクトル**（15次元）:

| Index | 特徴 | 種別 |
|---|---|---|
| 0-3 | 左右虹彩比率 X, Y | 基本 |
| 4 | yaw / 90 | 基本 |
| 5 | pitch / 30 | 基本 |
| 6 | 眼間距離 | 基本 |
| 7 | 平均正規化眼高 | 基本 |
| 8-14 | 二次交互作用項（$\bar{x}^2$, $\bar{y}^2$, $\bar{x} \cdot \text{yaw}$, ...） | 選択対象 |

### 6.2 正則化パラメータ $\lambda$ の自動選択

候補 $\{0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0\}$ から LOO-CV 誤差最小化で選択する（**数理最適化**）。

### 6.3 特徴選択（後退除去法）

基本 8 特徴を固定し、交互作用項（Index 8-14）について LOO-CV に基づく後退除去を行う。$\Delta\text{LOO} \leq 0$ であれば特徴を除去する（**数理最適化**）。

### 6.4 外れ値除去（MAD ベース）

$$
\hat{\sigma} = 1.4826 \times \text{MAD}, \quad |\text{sample} - \text{median}| > 3\hat{\sigma} \Rightarrow \text{除去}
$$

### 6.5 レンズ補正（べき乗則）

回帰出力の中心バイアスを補正する:

$$
x' = 0.5 + \text{sign}(x - 0.5) \cdot 0.5 \cdot (2|x - 0.5|)^\gamma
$$

$\gamma$ は黄金分割探索により $[0.2, 1.2]$ の範囲で最適化する（精度 0.01、**数理最適化**）。

$t = 2|x - 0.5| < 0.1$ の領域では線形ブレンドで安定性を確保する。

### 6.6 頭部姿勢補正（線形補償）

$$
x_{\text{corr}} = x + k_x \cdot \text{yaw}, \quad y_{\text{corr}} = y + k_y \cdot \text{pitch}
$$

$$
k = \frac{\sum (\text{residual} \cdot \theta)}{\sum \theta^2}, \quad |k| \leq 0.015
$$

角度の標準偏差が閾値未満（yaw: 2°, pitch: 1°）の場合は適用しない。係数は最小二乗法で学習する（**数理最適化**）。

---

## 7. 垂直視線補正 MLP

虹彩比率の非線形変換を 2 層 MLP で学習する。

**アーキテクチャ**: 10 → 16 (ReLU) → 8 (ReLU) → 1 (Linear)

**入力**: 左右眼の `[normEyeHeight, normIrisUpper, normIrisLower, irisRatioY, EAR]`（計 10 次元）

**学習**: SGD、MSE 損失、Xavier 初期化。データ拡張（$\pm1\%, \pm2\%, \pm3\%$ ノイズ）で 6 倍に増幅。

| パラメータ | 値 |
|---|---|
| 学習率 | 0.01 |
| バッチサイズ | 16 |
| エポック数 | 50 |

---

## 8. 虹彩プリフィルタ（One-Euro Filter）

$$
\hat{x}_t = \alpha_t \cdot x_t + (1 - \alpha_t) \cdot \hat{x}_{t-1}, \quad \alpha_t = \frac{1}{1 + \frac{f_s}{2\pi f_c}}
$$

$$
f_c = f_{\min} + \beta \cdot |\dot{x}_t|
$$

| パラメータ | 値 |
|---|---|
| $f_{\min}$ | 0.4 Hz |
| $\beta$ | 0.2 |
| $f_{c,\text{deriv}}$ | 1.0 Hz |

---
