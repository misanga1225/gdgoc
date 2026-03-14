import type { GazeProvider } from "./types";
import { MockGazeProvider } from "./mock-provider";

export type { GazeProvider, ParagraphGaze } from "./types";

/** 視線プロバイダーのファクトリ（将来MediaPipeに差し替え可能） */
export function createGazeProvider(): GazeProvider {
  return new MockGazeProvider();
}
