import type { GazeProvider } from "./types";
import { MockGazeProvider } from "./mock-provider";
import { MediaPipeGazeProvider } from "./mediapipe-provider";

export type { GazeProvider, ParagraphGaze } from "./types";
export { MediaPipeGazeProvider };

/**
 * 視線プロバイダーのファクトリ
 *
 * カメラが利用可能なら MediaPipe ベースのプロバイダーを返す。
 * カメラ不可・ユーザー拒否・初期化失敗時は MockGazeProvider にフォールバック。
 */
export async function createGazeProvider(): Promise<GazeProvider> {
  try {
    const provider = new MediaPipeGazeProvider();
    await provider.initialize();
    return provider;
  } catch (e) {
    console.warn("MediaPipe 初期化失敗、Mock にフォールバック:", e);
    return new MockGazeProvider();
  }
}
