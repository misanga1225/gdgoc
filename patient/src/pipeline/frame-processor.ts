import type { FrameInput, Region } from "../types.js";
import type { Landmark } from "../mediapipe/types.js";
import { extractIrisData } from "../mediapipe/iris-tracker.js";
import { estimateHeadPose } from "../mediapipe/head-pose-estimator.js";
import { GazeEstimator } from "../mediapipe/gaze-estimator.js";
import { MouseTracker } from "./mouse-tracker.js";
import { VerticalGazeRefiner } from "../mediapipe/vertical-gaze-mlp.js";
import { TemporalFilter, OneEuroFilter } from "../temporal-filter.js";

/**
 * MediaPipeの出力を既存のFrameInput型に変換するパイプライン
 */
export class FrameProcessor {
  readonly gazeEstimator = new GazeEstimator();
  readonly mouseTracker = new MouseTracker();
  readonly verticalRefiner = new VerticalGazeRefiner();
  private gazeFilterX = new OneEuroFilter(0.4, 0.2, 1.0, 0.5);
  private gazeFilterY = new OneEuroFilter(0.4, 0.2, 1.0, 0.5);
  private lastTimestamp = 0;

  /**
   * MediaPipeの生出力からFrameInputを生成する
   */
  process(
    landmarks: Landmark[] | null,
    transformMatrix: { data: Float32Array } | null,
    region: Region,
    timestampMs: number,
  ): FrameInput {
    const now = timestampMs / 1000;
    const dt = this.lastTimestamp > 0 ? now - this.lastTimestamp : 1 / 30;
    this.lastTimestamp = now;

    const mouseState = this.mouseTracker.getState(region, now);

    // 顔が検出されない場合
    if (!landmarks || landmarks.length < 478) {
      return {
        gaze: {
          point: { x: 0.5, y: 0.5 },
          faceDetected: false,
          confidence: 0,
        },
        mouse: mouseState,
        headPose: { yaw: 0, pitch: 0, roll: 0, confidence: 0 },
        region,
        dt: Math.min(dt, 0.1), // 100msでクランプ
      };
    }

    // 虹彩データの抽出（MLP垂直補正付き）
    const iris = extractIrisData(landmarks, this.verticalRefiner);

    // 頭部姿勢の推定
    const headPose = estimateHeadPose(landmarks, transformMatrix);

    // 視線座標の推定
    let gazePoint = { x: 0.5, y: 0.5 };
    let gazeConfidence = 0.5;

    if (iris) {
      if (iris.isBlinking) {
        // まばたき中: 前フレームの視線座標を維持（フィルタ値）、信頼度を下げる
        gazePoint = {
          x: this.gazeFilterX.current,
          y: this.gazeFilterY.current,
        };
        gazeConfidence = 0.1;
      } else {
        gazePoint = this.gazeEstimator.estimate(iris, headPose);
        gazePoint = {
          x: this.gazeFilterX.update(gazePoint.x, dt),
          y: this.gazeFilterY.update(gazePoint.y, dt),
        };
        const irisQuality = Math.max(iris.leftConfidence, iris.rightConfidence);
        const baseConf = this.gazeEstimator.isCalibrated ? 0.9 : 0.15;
        gazeConfidence = baseConf * Math.max(irisQuality, 0.3);
      }
    }

    return {
      gaze: {
        point: gazePoint,
        faceDetected: true,
        confidence: gazeConfidence,
      },
      mouse: mouseState,
      headPose: {
        yaw: headPose.yaw,
        pitch: headPose.pitch,
        roll: headPose.roll,
        confidence: 0.9 * headPoseReliability(headPose),
      },
      region,
      dt: Math.min(dt, 0.1),
    };
  }

  reset(): void {
    this.gazeEstimator.reset();
    this.gazeFilterX.reset(0.5);
    this.gazeFilterY.reset(0.5);
    this.lastTimestamp = 0;
  }
}

/**
 * 頭部姿勢推定の信頼性は極端な角度で低下する
 * MediaPipeのランドマーク検出精度が角度に応じて劣化するため
 */
function headPoseReliability(hp: { yaw: number; pitch: number }): number {
  const YAW_LIMIT = 45;
  const PITCH_LIMIT = 35;
  const FLOOR = 0.4;
  const yawFactor = Math.cos(
    (Math.PI / 2) * Math.min(Math.abs(hp.yaw) / YAW_LIMIT, 1),
  );
  const pitchFactor = Math.cos(
    (Math.PI / 2) * Math.min(Math.abs(hp.pitch) / PITCH_LIMIT, 1),
  );
  return Math.max(FLOOR, yawFactor * pitchFactor);
}
