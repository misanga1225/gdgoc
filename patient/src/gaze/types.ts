/** 段落ごとの視線データ */
export interface ParagraphGaze {
  paragraphId: string;
  dwellTime: number;
  isReached: boolean;
}

/** 視線プロバイダーのインターフェース（MockとMediaPipeで差し替え可能） */
export interface GazeProvider {
  /** 追跡を開始する */
  start(paragraphs: HTMLElement[]): void;
  /** 追跡を停止する */
  stop(): void;
  /** 視線データ更新時のコールバックを登録する */
  onUpdate(callback: (data: ParagraphGaze[]) => void): void;
}
