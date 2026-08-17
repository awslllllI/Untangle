import { distance } from '../core/geometry';
import type { Deal, Vec2 } from '../core/types';
import type { Camera } from './camera';
import { VERTEX_RADIUS_SCREEN } from './svgGraph';

export type InputCallbacks = {
  /** 请求重绘。 */
  onChange: () => void;
  /** 选中点被拖动，几何已变。 */
  onVertexDrag: () => void;
  /** 顶点拖动结束（用于通关检测）。 */
  onDragEnd: () => void;
  /** 当前拖拽中的顶点，或 null。 */
  onActiveVertex: (vertexId: number | null) => void;
  /** 开始在图形区操作（用于收起工具栏）。 */
  onGraphInteract?: () => void;
};

type PointerMode =
  | { kind: 'none' }
  | {
      kind: 'drag-vertex';
      pointerId: number;
      vertexId: number;
      grabOffset: Vec2;
    }
  | { kind: 'pan'; pointerId: number; lastScreen: Vec2 }
  | {
      kind: 'pinch';
      lastDistance: number;
      lastMidpoint: Vec2;
      /** 拖点中双指：只平移，不缩放；松一指后继续拖该点。 */
      panOnly: boolean;
      resumeVertexId: number | null;
    };

/**
 * 绑定画布指针与滚轮：
 * - 单指点上：拖点；空白：平移
 * - 双指：缩放；拖点中双指：平移画布，松一指后继续拖点
 * - 滚轮：缩放
 */
export function attachInput(
  surface: SVGSVGElement,
  camera: Camera,
  getDeal: () => Deal,
  callbacks: InputCallbacks,
): () => void {
  let mode: PointerMode = { kind: 'none' };
  const activePointers = new Map<number, Vec2>();

  /**
   * 将 PointerEvent 转为表面像素坐标。
   */
  function eventToScreen(event: PointerEvent): Vec2 {
    const rect = surface.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * 屏幕空间命中顶点（半径与屏幕恒定圆点一致）。
   */
  function hitTestVertex(screen: Vec2, deal: Deal): number | null {
    const hitRadius = VERTEX_RADIUS_SCREEN + 12;
    const hitRadiusSq = hitRadius * hitRadius;
    let bestId: number | null = null;
    let bestDistSq = hitRadiusSq;
    for (const v of deal.vertices) {
      const p = camera.worldToScreen(v.position);
      const dx = screen.x - p.x;
      const dy = screen.y - p.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        bestId = v.id;
      }
    }
    return bestId;
  }

  /**
   * 进入拖点（抓取偏移避免跳点）。
   */
  function beginDragVertex(pointerId: number, screen: Vec2, vertexId: number): void {
    const deal = getDeal();
    const vertex = deal.vertices[vertexId];
    const world = camera.screenToWorld(screen);
    mode = {
      kind: 'drag-vertex',
      pointerId,
      vertexId,
      grabOffset: {
        x: vertex.position.x - world.x,
        y: vertex.position.y - world.y,
      },
    };
    callbacks.onActiveVertex(vertexId);
  }

  /**
   * 进入双指：普通捏合缩放；拖点中则只平移并记住要恢复的点。
   */
  function beginTwoFingerMode(fromDragVertexId: number | null): void {
    if (activePointers.size !== 2) {
      return;
    }
    const points = [...activePointers.values()];
    mode = {
      kind: 'pinch',
      lastDistance: Math.max(1, distance(points[0], points[1])),
      lastMidpoint: {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      },
      panOnly: fromDragVertexId !== null,
      resumeVertexId: fromDragVertexId,
    };
  }

  /**
   * pointerdown：第二指进双指；否则点上拖点 / 空白平移。
   */
  function onPointerDown(event: PointerEvent): void {
    surface.setPointerCapture(event.pointerId);
    callbacks.onGraphInteract?.();
    const screen = eventToScreen(event);
    activePointers.set(event.pointerId, screen);

    if (activePointers.size >= 2) {
      const fromDrag =
        mode.kind === 'drag-vertex' ? mode.vertexId : null;
      if (mode.kind === 'drag-vertex') {
        callbacks.onDragEnd();
      }
      beginTwoFingerMode(fromDrag);
      callbacks.onChange();
      return;
    }

    const vertexId = hitTestVertex(screen, getDeal());
    if (vertexId !== null) {
      beginDragVertex(event.pointerId, screen, vertexId);
    } else {
      mode = { kind: 'pan', pointerId: event.pointerId, lastScreen: screen };
      callbacks.onActiveVertex(null);
    }
    callbacks.onChange();
  }

  /**
   * pointermove：拖点、平移或双指。
   */
  function onPointerMove(event: PointerEvent): void {
    if (!activePointers.has(event.pointerId)) {
      return;
    }
    const screen = eventToScreen(event);
    activePointers.set(event.pointerId, screen);

    if (activePointers.size >= 2) {
      if (mode.kind !== 'pinch') {
        const fromDrag =
          mode.kind === 'drag-vertex' ? mode.vertexId : null;
        if (mode.kind === 'drag-vertex') {
          callbacks.onDragEnd();
        }
        beginTwoFingerMode(fromDrag);
      }
      if (mode.kind === 'pinch' && activePointers.size === 2) {
        const points = [...activePointers.values()];
        const dist = Math.max(1, distance(points[0], points[1]));
        const mid = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        if (!mode.panOnly) {
          const factor = dist / mode.lastDistance;
          camera.zoomAt(mid, factor);
        }
        camera.panByScreenDelta(mid.x - mode.lastMidpoint.x, mid.y - mode.lastMidpoint.y);
        mode.lastDistance = dist;
        mode.lastMidpoint = mid;
        callbacks.onChange();
      }
      return;
    }

    if (mode.kind === 'drag-vertex' && mode.pointerId === event.pointerId) {
      const deal = getDeal();
      const world = camera.screenToWorld(screen);
      deal.vertices[mode.vertexId].position = {
        x: world.x + mode.grabOffset.x,
        y: world.y + mode.grabOffset.y,
      };
      callbacks.onVertexDrag();
      return;
    }

    if (mode.kind === 'pan' && mode.pointerId === event.pointerId) {
      const dx = screen.x - mode.lastScreen.x;
      const dy = screen.y - mode.lastScreen.y;
      camera.panByScreenDelta(dx, dy);
      mode.lastScreen = screen;
      callbacks.onChange();
    }
  }

  /**
   * pointerup / cancel：结束手势；拖点中双指松一指则继续拖点。
   */
  function onPointerUp(event: PointerEvent): void {
    const wasDragging =
      mode.kind === 'drag-vertex' && mode.pointerId === event.pointerId;
    const resumeFromPinch =
      mode.kind === 'pinch' ? mode.resumeVertexId : null;

    activePointers.delete(event.pointerId);

    if (wasDragging) {
      callbacks.onDragEnd();
    }

    if (activePointers.size === 0) {
      mode = { kind: 'none' };
      callbacks.onActiveVertex(null);
    } else if (activePointers.size === 1) {
      const [pointerId, lastScreen] = [...activePointers.entries()][0];
      if (resumeFromPinch !== null) {
        beginDragVertex(pointerId, lastScreen, resumeFromPinch);
      } else {
        mode = { kind: 'pan', pointerId, lastScreen };
        callbacks.onActiveVertex(null);
      }
    } else {
      beginTwoFingerMode(resumeFromPinch);
    }

    callbacks.onChange();
  }

  /**
   * 滚轮缩放（桌面）。
   */
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    callbacks.onGraphInteract?.();
    const rect = surface.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    camera.zoomAt(screen, factor);
    callbacks.onChange();
  }

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('pointercancel', onPointerUp);
  surface.addEventListener('wheel', onWheel, { passive: false });

  /**
   * 解除所有监听。
   */
  return () => {
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerup', onPointerUp);
    surface.removeEventListener('pointercancel', onPointerUp);
    surface.removeEventListener('wheel', onWheel);
  };
}
