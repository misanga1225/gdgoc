import type { Point2D, Region, MouseInput } from "../types.js";

/**
 * マウスの位置・速度・滞在時間を追跡する
 */
export class MouseTracker {
  private currentPos: Point2D = { x: 0.5, y: 0.5 };
  private prevPos: Point2D = { x: 0.5, y: 0.5 };
  private lastMoveTime = 0;
  private velocity = 0;
  private dwellStartTime = 0;
  private isInsideRegion = false;
  private viewportWidth = 1;
  private viewportHeight = 1;

  /**
   * ビューポートサイズを設定（位置の正規化に使用）
   */
  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /**
   * mousemoveイベントのハンドラ
   */
  onMouseMove(event: { clientX: number; clientY: number }): void {
    this.prevPos = { ...this.currentPos };
    this.currentPos = {
      x: event.clientX / this.viewportWidth,
      y: event.clientY / this.viewportHeight,
    };

    const now = performance.now() / 1000;
    const dt = now - this.lastMoveTime;
    if (dt > 0 && this.lastMoveTime > 0) {
      const dx = this.currentPos.x - this.prevPos.x;
      const dy = this.currentPos.y - this.prevPos.y;
      this.velocity = Math.sqrt(dx * dx + dy * dy) / dt;
    }
    this.lastMoveTime = now;
  }

  /**
   * 現在のマウス状態を取得する
   */
  getState(region: Region, now: number): MouseInput {
    // 領域内かどうかチェック
    const dx = this.currentPos.x - region.center.x;
    const dy = this.currentPos.y - region.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inside = dist <= region.radius;

    if (inside && !this.isInsideRegion) {
      // 領域に入った
      this.dwellStartTime = now;
      this.isInsideRegion = true;
    } else if (!inside && this.isInsideRegion) {
      // 領域から出た
      this.isInsideRegion = false;
      this.dwellStartTime = 0;
    }

    const dwellTime = this.isInsideRegion ? now - this.dwellStartTime : 0;

    // 一定時間マウスが動かなければ速度を減衰
    const timeSinceMove = now - this.lastMoveTime;
    const effectiveVelocity = timeSinceMove > 0.1 ? this.velocity * Math.exp(-timeSinceMove * 5) : this.velocity;

    return {
      point: { ...this.currentPos },
      dwellTime: Math.max(0, dwellTime),
      velocity: effectiveVelocity,
      confidence: 1.0,
    };
  }
}
