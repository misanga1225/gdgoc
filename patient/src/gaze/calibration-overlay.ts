import { FaceLandmarkerWrapper } from "../mediapipe/face-landmarker.js";
import { GazeEstimator } from "../mediapipe/gaze-estimator.js";
import { CalibrationManager } from "../calibration/calibration-manager.js";
import { extractIrisData } from "../mediapipe/iris-tracker.js";
import { estimateHeadPose } from "../mediapipe/head-pose-estimator.js";
import type { Point2D } from "../types.js";

/** 顔未検出が続いた場合のタイムアウト（秒） */
const FACE_LOST_TIMEOUT_SEC = 30;

/** カウントダウン秒数 */
const COUNTDOWN_SEC = 3;

/**
 * キャリブレーション用フルスクリーンオーバーレイ
 *
 * 20点（4x4 + 4補助）のキャリブレーションフローを管理し、
 * 完了後に自動的にDOMから除去される。
 */
export class CalibrationOverlay {
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private statusEl: HTMLDivElement | null = null;

  /**
   * キャリブレーションを実行する（Promise ベース）
   * 顔が一定時間検出されない場合は自動的にタイムアウトして reject する
   * @returns meanError キャリブレーション誤差
   */
  async run(
    faceLandmarker: FaceLandmarkerWrapper,
    gazeEstimator: GazeEstimator,
    calibManager: CalibrationManager,
    video: HTMLVideoElement,
  ): Promise<number> {
    this.mount();
    calibManager.reset();
    calibManager.start();

    const config = calibManager.getConfig();
    const firstPoint = calibManager.getCurrentPoint();

    // カウントダウンフェーズ
    await this.showCountdown(firstPoint);

    return new Promise<number>((resolve, reject) => {
      let faceLostSince = 0;

      const loop = () => {
        if (!this.canvas || !this.ctx) {
          reject(new Error("Overlay was removed"));
          return;
        }

        const timestampMs = performance.now();
        const now = timestampMs / 1000;
        const result = faceLandmarker.detect(video, timestampMs);
        const landmarks = result?.faceLandmarks?.[0] ?? null;
        const transformMatrix = result?.facialTransformationMatrixes?.[0] ?? null;

        // キャンバスクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const state = calibManager.getState();
        if (state.phase !== "collecting") {
          requestAnimationFrame(loop);
          return;
        }

        const currentPoint = calibManager.getCurrentPoint();
        if (!currentPoint) {
          requestAnimationFrame(loop);
          return;
        }

        // warmup中のフェードイン進捗（0→1）
        const warmupProgress = Math.min(state.elapsed / config.warmupTimeSec, 1);
        // 全体の進捗（0→1）
        const progress = state.elapsed / config.dwellTimeSec;
        this.drawCalibrationPoint(currentPoint, Math.min(progress, 1), warmupProgress);

        // 顔未検出のタイムアウト判定
        const faceDetected = landmarks && landmarks.length >= 478;
        if (!faceDetected) {
          if (faceLostSince === 0) faceLostSince = now;
          if (now - faceLostSince > FACE_LOST_TIMEOUT_SEC) {
            this.unmount();
            reject(new Error("キャリブレーション中に顔が検出されませんでした。カメラの位置を確認してください。"));
            return;
          }
          // ステータスに警告表示
          if (this.statusEl) {
            const remaining = Math.ceil(FACE_LOST_TIMEOUT_SEC - (now - faceLostSince));
            this.statusEl.textContent =
              `顔が検出されません — カメラの前に顔を合わせてください（${remaining}秒後にスキップ）`;
          }
          requestAnimationFrame(loop);
          return;
        }

        faceLostSince = 0;

        // ステータス更新
        if (this.statusEl) {
          this.statusEl.textContent =
            `ポイント ${state.pointIndex + 1}/${calibManager.totalPoints} — 黄色い点を見てください`;
        }

        // 顔が検出されている場合のみサンプル収集
        const iris = extractIrisData(landmarks);
        const headPose = estimateHeadPose(
          landmarks,
          transformMatrix as { data: Float32Array } | null,
        );

        if (iris) {
          const features = gazeEstimator.extractFeatures(iris, headPose);
          const collecting = calibManager.addSample(features, 1 / 30);

          if (!collecting) {
            // キャリブレーション完了
            try {
              const {
                regression,
                meanError,
                lensGammaX,
                lensGammaY,
                headKx,
                headKy,
                selectedFeatures,
              } = calibManager.compute();

              gazeEstimator.setRegression(
                regression,
                { x: lensGammaX, y: lensGammaY },
                headKx,
                headKy,
                selectedFeatures,
              );

              this.unmount();
              resolve(meanError);
            } catch (e) {
              this.unmount();
              reject(e);
            }
            return;
          }
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    });
  }

  /**
   * 3秒カウントダウンを表示する
   * 最初のキャリブレーション点を薄く予告表示しつつ、中央にカウントダウンを描画
   */
  private showCountdown(firstPoint: Point2D | null): Promise<void> {
    return new Promise((resolve) => {
      const startTime = performance.now();

      const tick = () => {
        if (!this.canvas || !this.ctx) {
          resolve();
          return;
        }

        const elapsed = (performance.now() - startTime) / 1000;
        const remaining = COUNTDOWN_SEC - elapsed;

        if (remaining <= 0) {
          resolve();
          return;
        }

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // 説明テキスト
        if (this.statusEl) {
          this.statusEl.textContent = "黄色い点を目で追ってください";
        }

        // 最初の点を薄く予告表示
        if (firstPoint) {
          this.drawCalibrationPoint(firstPoint, 0, 0.3);
        }

        // カウントダウン数字
        const count = Math.ceil(remaining);
        ctx.save();
        ctx.font = "bold 120px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // フェード効果（各数字が切り替わるときにフェード）
        const fraction = remaining - Math.floor(remaining);
        const alpha = Math.min(fraction * 2, 1);

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
        ctx.shadowBlur = 30;
        ctx.fillText(`${count}`, cx, cy);
        ctx.restore();

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  private mount(): void {
    // コンテナ
    this.container = document.createElement("div");
    this.container.style.cssText =
      "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);";

    // ステータス
    this.statusEl = document.createElement("div");
    this.statusEl.style.cssText =
      "position:absolute;top:24px;left:50%;transform:translateX(-50%);" +
      "color:#fff;font-size:18px;font-weight:bold;text-align:center;" +
      "padding:8px 24px;background:rgba(0,0,0,0.5);border-radius:8px;";
    this.statusEl.textContent = "キャリブレーション準備中...";
    this.container.appendChild(this.statusEl);

    // キャンバス
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx = this.canvas.getContext("2d");
    this.container.appendChild(this.canvas);

    // リサイズ対応
    const onResize = () => {
      if (this.canvas) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", onResize);
    (this.container as any)._resizeHandler = onResize;

    document.body.appendChild(this.container);
  }

  private unmount(): void {
    if (this.container) {
      const handler = (this.container as any)._resizeHandler;
      if (handler) window.removeEventListener("resize", handler);
      this.container.remove();
    }
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.statusEl = null;
  }

  /**
   * キャリブレーション点を描画する
   * @param point 描画位置 [0,1]
   * @param progress 進捗アーク（0→1）
   * @param opacity 全体の不透明度（0→1）。warmup中のフェードインに使用
   */
  private drawCalibrationPoint(point: Point2D, progress: number, opacity: number = 1): void {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const x = point.x * this.canvas.width;
    const y = point.y * this.canvas.height;

    ctx.save();
    ctx.globalAlpha = opacity;

    // グロー
    ctx.shadowColor = "rgba(255, 255, 0, 0.8)";
    ctx.shadowBlur = 20;

    // 外円
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 0, 0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // 進捗アーク
    if (progress > 0) {
      ctx.beginPath();
      ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = "rgba(0, 255, 0, 1)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // 中心点
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "yellow";
    ctx.fill();

    ctx.restore();
  }
}
