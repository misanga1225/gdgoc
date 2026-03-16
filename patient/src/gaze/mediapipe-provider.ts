import type { GazeProvider, ParagraphGaze } from "./types.js";
import type { Region } from "../types.js";
import { FaceLandmarkerWrapper } from "../mediapipe/face-landmarker.js";
import { FrameProcessor } from "../pipeline/frame-processor.js";
import { CalibrationManager } from "../calibration/calibration-manager.js";
import { AttentionModel } from "../attention-model.js";
import { ElementAttentionTracker } from "../oversight/element-attention-tracker.js";
import { CalibrationOverlay } from "./calibration-overlay.js";

const SYNC_INTERVAL_MS = 2500;
const FACE_LOST_WARN_SEC = 5;

/**
 * MediaPipe ベースの視線追跡プロバイダー
 *
 * カメラ映像 → MediaPipe FaceLandmarker → 虹彩追跡 → Ridge回帰キャリブレーション
 * → 3モダリティ注意度モデル → 段落ごとの ParagraphGaze を出力
 */
export class MediaPipeGazeProvider implements GazeProvider {
  private faceLandmarker = new FaceLandmarkerWrapper();
  private frameProcessor = new FrameProcessor();
  private calibManager = new CalibrationManager();
  private attentionModel = new AttentionModel();
  private elementTracker = new ElementAttentionTracker();

  private video: HTMLVideoElement | null = null;
  private paragraphs: HTMLElement[] = [];
  private callback: ((data: ParagraphGaze[]) => void) | null = null;
  private animFrameId: number | null = null;
  private syncTimer: number | null = null;
  private running = false;

  // 顔ロスト警告
  private faceLostSince = 0;
  private faceLostWarningEl: HTMLDivElement | null = null;

  // デバッグ用視線ポインタ
  private gazePointerEl: HTMLDivElement | null = null;
  private debugGaze = true; // 視線ポインタ表示フラグ

  // 前フレームの視線座標（Region導出用）
  private lastGazePoint = { x: 0.5, y: 0.5 };

  /** カメラ + MediaPipe モデルを初期化する */
  async initialize(): Promise<void> {
    // video 要素を生成（非表示）
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.style.display = "none";
    document.body.appendChild(this.video);

    // カメラ取得
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    this.video.srcObject = stream;
    await this.video.play();

    // MediaPipe 初期化（GPU → CPU フォールバック）
    try {
      await this.faceLandmarker.initialize({ delegate: "GPU" });
    } catch {
      await this.faceLandmarker.initialize({ delegate: "CPU" });
    }

    // マウストラッカー初期化
    this.frameProcessor.mouseTracker.setViewport(
      window.innerWidth,
      window.innerHeight,
    );
    window.addEventListener("resize", this.onResize);
    window.addEventListener("mousemove", this.onMouseMove);
  }

  /** 20点キャリブレーションを実行する */
  async calibrate(): Promise<number> {
    if (!this.video) throw new Error("Not initialized");
    const overlay = new CalibrationOverlay();
    const meanError = await overlay.run(
      this.faceLandmarker,
      this.frameProcessor.gazeEstimator,
      this.calibManager,
      this.video,
    );

    // キャリブレーション誤差を AttentionModel に反映（σ適応拡大）
    if (meanError > 0) {
      this.attentionModel = new AttentionModel({ calibrationError: meanError });
    }

    console.log(
      `[MediaPipeGazeProvider] calibration done, meanError=${(meanError * 100).toFixed(1)}%`,
    );
    return meanError;
  }

  onUpdate(callback: (data: ParagraphGaze[]) => void): void {
    this.callback = callback;
  }

  start(paragraphs: HTMLElement[]): void {
    this.paragraphs = paragraphs;
    this.running = true;
    this.animFrameId = requestAnimationFrame(this.loop);

    // 定期同期
    this.syncTimer = window.setInterval(() => {
      this.emitUpdate();
    }, SYNC_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.syncTimer !== null) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // 最終データを送信
    this.emitUpdate();

    // クリーンアップ
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.hideFaceLostWarning();
    this.removeGazePointer();

    this.faceLandmarker.close();

    if (this.video) {
      const stream = this.video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      this.video.remove();
      this.video = null;
    }
  }

  // --- private ---

  private loop = (): void => {
    if (!this.running || !this.video) return;

    const timestampMs = performance.now();
    const result = this.faceLandmarker.detect(this.video, timestampMs);
    const landmarks = result?.faceLandmarks?.[0] ?? null;
    const transformMatrix = result?.facialTransformationMatrixes?.[0] ?? null;

    // 顔ロスト警告
    const now = timestampMs / 1000;
    if (!landmarks || landmarks.length < 478) {
      if (this.faceLostSince === 0) this.faceLostSince = now;
      if (now - this.faceLostSince > FACE_LOST_WARN_SEC) {
        this.showFaceLostWarning();
      }
    } else {
      this.faceLostSince = 0;
      this.hideFaceLostWarning();
    }

    // 視線下の段落を特定 → Region 導出
    const el = this.getElementAtGaze(this.lastGazePoint);
    const fallbackRegion: Region = {
      center: { x: 0.5, y: 0.5 },
      radius: 0.12,
    };
    const region = el ? this.getRegionFromElement(el) : fallbackRegion;

    // FrameProcessor でパイプライン実行
    const frameInput = this.frameProcessor.process(
      landmarks,
      transformMatrix as { data: Float32Array } | null,
      region,
      timestampMs,
    );

    // 視線座標を保存（次フレームのRegion導出用）
    this.lastGazePoint = frameInput.gaze.point;

    // デバッグ用視線ポインタの更新
    if (this.debugGaze) {
      this.updateGazePointer(frameInput.gaze.point, frameInput.gaze.faceDetected);
    }

    // 注意度モデルで融合
    const output = this.attentionModel.update(frameInput);

    // 要素トラッカーに蓄積
    if (el) {
      this.elementTracker.update(el, output.attention, frameInput.dt);
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private emitUpdate(): void {
    if (!this.callback) return;

    const records = this.elementTracker.getAllRecords();
    const gazeData: ParagraphGaze[] = [];

    for (const record of records) {
      const el = record.element as HTMLElement;
      const paragraphId = el.getAttribute("data-paragraph-id");
      if (!paragraphId) continue;

      gazeData.push({
        paragraphId,
        dwellTime: record.totalDwellTime,
        isReached: record.totalDwellTime > 0,
      });
    }

    // paragraphs のうちトラッカーに記録がないもの（一度も見られていない）
    for (const p of this.paragraphs) {
      const pid = p.getAttribute("data-paragraph-id");
      if (!pid) continue;
      if (gazeData.some((g) => g.paragraphId === pid)) continue;
      gazeData.push({ paragraphId: pid, dwellTime: 0, isReached: false });
    }

    this.callback(gazeData);
  }

  /** 視線座標からDOM要素を特定する */
  private getElementAtGaze(gazePoint: { x: number; y: number }): HTMLElement | null {
    const x = gazePoint.x * window.innerWidth;
    const y = gazePoint.y * window.innerHeight;
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;

    // data-paragraph-id を持つ要素を探す（自身 or 祖先）
    const paragraphEl = el.closest("[data-paragraph-id]") as HTMLElement | null;
    return paragraphEl;
  }

  /** DOM要素から正規化Regionを導出する */
  private getRegionFromElement(el: HTMLElement): Region {
    const rect = el.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2 / window.innerWidth;
    const cy = (rect.top + rect.bottom) / 2 / window.innerHeight;
    const halfW = rect.width / 2 / window.innerWidth;
    const halfH = rect.height / 2 / window.innerHeight;
    const radius = Math.max(Math.min(halfW, halfH), 0.04);
    return { center: { x: cx, y: cy }, radius };
  }

  private onResize = (): void => {
    this.frameProcessor.mouseTracker.setViewport(
      window.innerWidth,
      window.innerHeight,
    );
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.frameProcessor.mouseTracker.onMouseMove(e);
  };

  private showFaceLostWarning(): void {
    if (this.faceLostWarningEl) return;
    this.faceLostWarningEl = document.createElement("div");
    this.faceLostWarningEl.style.cssText =
      "position:fixed;top:0;left:0;right:0;padding:12px;text-align:center;" +
      "background:rgba(217,48,37,0.9);color:#fff;font-size:14px;font-weight:bold;" +
      "z-index:9999;";
    this.faceLostWarningEl.textContent =
      "顔が検出されません — カメラの前に顔を合わせてください";
    document.body.appendChild(this.faceLostWarningEl);
  }

  private hideFaceLostWarning(): void {
    if (this.faceLostWarningEl) {
      this.faceLostWarningEl.remove();
      this.faceLostWarningEl = null;
    }
  }

  /** デバッグ用視線ポインタを更新する */
  private updateGazePointer(
    point: { x: number; y: number },
    faceDetected: boolean,
  ): void {
    if (!this.gazePointerEl) {
      this.gazePointerEl = document.createElement("div");
      this.gazePointerEl.style.cssText =
        "position:fixed;width:18px;height:18px;border-radius:50%;" +
        "pointer-events:none;z-index:99999;transform:translate(-50%,-50%);" +
        "border:2px solid rgba(255,255,255,0.8);" +
        "box-shadow:0 0 8px rgba(0,0,0,0.4);" +
        "transition:opacity 0.15s;";
      document.body.appendChild(this.gazePointerEl);
    }

    const px = point.x * window.innerWidth;
    const py = point.y * window.innerHeight;
    this.gazePointerEl.style.left = `${px}px`;
    this.gazePointerEl.style.top = `${py}px`;
    this.gazePointerEl.style.background = faceDetected
      ? "rgba(66,133,244,0.7)"  // 青: 顔検出中
      : "rgba(234,67,53,0.7)";  // 赤: 顔ロスト
    this.gazePointerEl.style.opacity = faceDetected ? "1" : "0.5";
  }

  /** デバッグ用視線ポインタを削除する */
  private removeGazePointer(): void {
    if (this.gazePointerEl) {
      this.gazePointerEl.remove();
      this.gazePointerEl = null;
    }
  }
}
