import { distance } from '../core/geometry';
import type { Deal, Vec2 } from '../core/types';
import type { Camera } from './camera';
import { VERTEX_RADIUS_WORLD } from './svgGraph';

export type InputCallbacks = {
  /** 请求重绘。 */
  onChange: () => void;
  /** 顶点被拖动后（用于通关检测）。 */
  onDragEnd: () => void;
  /** 当前拖拽中的顶点，或 null。 */
  onActiveVertex: (vertexId: number | null) => void;
};

type PointerMode =
  | { kind: 'none' }
  | { kind: 'drag-vertex'; pointerId: number; vertexId: number }
  | { kind: 'pan'; pointerId: number; lastScreen: Vec2 }
  | {
      kind: 'pinch';
      pointers: Map<number, Vec2>;
      lastDistance: number;
      lastMidpoint: Vec2;
    };

/**
 * 绑定画布指针与滚轮：拖点 / 平移 / 双指缩放 / 滚轮缩放。
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
   * 在屏幕空间命中最近顶点；半径与视觉圆一致（世界半径 × scale）。
   */
  function hitTestVertex(screen: Vec2, deal: Deal): number | null {
    const hitRadius = VERTEX_RADIUS_WORLD * camera.scale + 8;
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
   * 进入或更新双指捏合状态。
   */
  function beginOrUpdatePinch(): void {
    if (activePointers.size !== 2) {
      return;
    }
    const points = [...activePointers.values()];
    const lastDistance = distance(points[0], points[1]);
    const lastMidpoint = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
    mode = {
      kind: 'pinch',
      pointers: new Map(activePointers),
      lastDistance: Math.max(1, lastDistance),
      lastMidpoint,
    };
  }

  /**
   * pointerdown：优先第二指进捏合，否则拖点或平移。
   */
  function onPointerDown(event: PointerEvent): void {
    surface.setPointerCapture(event.pointerId);
    const screen = eventToScreen(event);
    activePointers.set(event.pointerId, screen);

    if (activePointers.size >= 2) {
      beginOrUpdatePinch();
      callbacks.onActiveVertex(null);
      callbacks.onChange();
      return;
    }

    const deal = getDeal();
    const vertexId = hitTestVertex(screen, deal);
    if (vertexId !== null) {
      mode = { kind: 'drag-vertex', pointerId: event.pointerId, vertexId };
      callbacks.onActiveVertex(vertexId);
    } else {
      mode = { kind: 'pan', pointerId: event.pointerId, lastScreen: screen };
      callbacks.onActiveVertex(null);
    }
    callbacks.onChange();
  }

  /**
   * pointermove：拖点、平移或捏合缩放。
   */
  function onPointerMove(event: PointerEvent): void {
    if (!activePointers.has(event.pointerId)) {
      return;
    }
    const screen = eventToScreen(event);
    activePointers.set(event.pointerId, screen);

    if (mode.kind === 'pinch' || activePointers.size >= 2) {
      if (activePointers.size === 2) {
        const points = [...activePointers.values()];
        const dist = Math.max(1, distance(points[0], points[1]));
        const mid = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        if (mode.kind !== 'pinch') {
          beginOrUpdatePinch();
        } else {
          const factor = dist / mode.lastDistance;
          camera.zoomAt(mid, factor);
          camera.panByScreenDelta(mid.x - mode.lastMidpoint.x, mid.y - mode.lastMidpoint.y);
          mode.lastDistance = dist;
          mode.lastMidpoint = mid;
        }
        callbacks.onChange();
      }
      return;
    }

    if (mode.kind === 'drag-vertex' && mode.pointerId === event.pointerId) {
      const deal = getDeal();
      const world = camera.screenToWorld(screen);
      deal.vertices[mode.vertexId].position = world;
      callbacks.onChange();
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
   * pointerup / cancel：结束对应手势。
   */
  function onPointerUp(event: PointerEvent): void {
    const wasDragging =
      mode.kind === 'drag-vertex' && mode.pointerId === event.pointerId;
    const draggedVertexId =
      wasDragging && mode.kind === 'drag-vertex' ? mode.vertexId : null;
    activePointers.delete(event.pointerId);

    // 先收尾拖点（此时 active 仍有效），再清高亮
    if (wasDragging && draggedVertexId !== null) {
      callbacks.onDragEnd();
    }

    if (activePointers.size === 0) {
      mode = { kind: 'none' };
      callbacks.onActiveVertex(null);
    } else if (activePointers.size === 1) {
      const [pointerId, lastScreen] = [...activePointers.entries()][0];
      mode = { kind: 'pan', pointerId, lastScreen };
      callbacks.onActiveVertex(null);
    } else {
      beginOrUpdatePinch();
      callbacks.onActiveVertex(null);
    }

    callbacks.onChange();
  }

  /**
   * 滚轮缩放（桌面）。
   */
  function onWheel(event: WheelEvent): void {
    event.preventDefault();
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
