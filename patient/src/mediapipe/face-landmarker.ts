import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

export interface FaceLandmarkerOptions {
  numFaces?: number;
  delegate?: "GPU" | "CPU";
}

/**
 * MediaPipe FaceLandmarker のラッパー
 * 初期化と映像フレームの処理を管理
 */
export class FaceLandmarkerWrapper {
  private landmarker: FaceLandmarker | null = null;

  async initialize(options: FaceLandmarkerOptions = {}): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: options.delegate ?? "GPU",
      },
      runningMode: "VIDEO",
      numFaces: options.numFaces ?? 1,
      outputFacialTransformationMatrixes: true,
      outputFaceBlendshapes: false,
    });
  }

  /**
   * 映像フレームを処理し、結果を返す
   */
  detect(videoFrame: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker) return null;
    return this.landmarker.detectForVideo(videoFrame, timestampMs);
  }

  get isReady(): boolean {
    return this.landmarker !== null;
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
