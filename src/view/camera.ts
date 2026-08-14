import type { Vec2 } from '../core/types';

/**
 * 相机：世界坐标 ↔ 屏幕坐标，支持平移与缩放。
 */
export class Camera {
  /** 屏幕中心对应的世界坐标。 */
  public center: Vec2 = { x: 0, y: 0 };

  /** 世界单位到像素的缩放。 */
  public scale = 1;

  /** 视口像素宽。 */
  public width = 1;

  /** 视口像素高。 */
  public height = 1;

  /** 设备像素比；绘制时把 CSS 像素映射到 canvas 缓冲。 */
  public dpr = 1;

  /**
   * 更新视口尺寸（通常来自 canvas 的 CSS 像素大小）。
   */
  public setViewport(width: number, height: number, dpr = 1): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.max(1e-6, dpr);
  }

  /**
   * 屏幕坐标转世界坐标。
   */
  public screenToWorld(screen: Vec2): Vec2 {
    return {
      x: (screen.x - this.width / 2) / this.scale + this.center.x,
      y: (screen.y - this.height / 2) / this.scale + this.center.y,
    };
  }

  /**
   * 世界坐标转屏幕坐标。
   */
  public worldToScreen(world: Vec2): Vec2 {
    return {
      x: (world.x - this.center.x) * this.scale + this.width / 2,
      y: (world.y - this.center.y) * this.scale + this.height / 2,
    };
  }

  /**
   * 以屏幕点为锚进行缩放（滚轮 / 双指）。
   */
  public zoomAt(screenAnchor: Vec2, factor: number, minScale = 0.05, maxScale = 20): void {
    const before = this.screenToWorld(screenAnchor);
    this.scale = clamp(this.scale * factor, minScale, maxScale);
    const after = this.screenToWorld(screenAnchor);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
  }

  /**
   * 按屏幕像素平移相机（手指移动方向与内容同向）。
   */
  public panByScreenDelta(dx: number, dy: number): void {
    this.center.x -= dx / this.scale;
    this.center.y -= dy / this.scale;
  }

  /**
   * 将世界包围盒适配进视口（重置视图）。
   */
  public fitBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    paddingRatio = 0.12,
  ): void {
    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);
    const padX = spanX * paddingRatio;
    const padY = spanY * paddingRatio;
    const worldW = spanX + padX * 2;
    const worldH = spanY + padY * 2;
    this.center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    };
    this.scale = Math.min(this.width / worldW, this.height / worldH);
  }
}

/**
 * 将数值限制在闭区间内。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
