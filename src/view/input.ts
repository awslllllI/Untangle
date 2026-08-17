import { distance } from '../core/geometry';
import type { Deal, Vec2 } from '../core/types';
import type { Camera } from './camera';
import { VERTEX_RADIUS_SCREEN } from './svgGraph';

export type InputCallbacks = {
  /** 相机变化（平移/缩放），请求刷新。 */
  onChange: () => void;
  /** 选中点被拖动，几何已变。 */
  onVertexDrag: () => void;
  /** 拖点手势结束（选中可保持）。 */
  onDragEnd: () => void;
  /** 当前选中的顶点；null 表示未选中。 */
  getSelectedVertexId: () => number | null;
  /** 设置选中顶点（一次只能一个）。 */
  setSelectedVertexId: (vertexId: number | null) => void;
  /** 开始在图形区操作（用于收起工具栏）。 */
  onGraphInteract?: () => void;
};

type PointerMode =
  | { kind: 'none' }
  | {
      kind: 'pan';
      pointerId: number;
      lastScreen: Vec2;
      downScreen: Vec2;
      moved: boolean;
    }
  | {
      kind: 'drag-vertex';
      pointerId: number;
      vertexId: number;
      grabOffset: Vec2;
      downScreen: Vec2;
      moved: boolean;
    }
  | {
      kind: 'pinch';
      lastDistance: number;
      lastMidpoint: Vec2;
      /** 选中时双指只平移，不缩放。 */
      panOnly: boolean;
    };

const TAP_MOVE_PX = 12;

/**
 * 手机优先手势：
 * - 未选中：单指平移，双指缩放
 * - 已选中：单指拖点，双指平移；双指变单指后继续拖点
 * - 轻点选中；拖点松手即取消选中；一次只能选一个点
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
      const dx = p.x - screen.x;
      const dy = p.y - screen.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        bestId = v.id;
      }
    }
    return bestId;
  }

  /**
   * 进入拖点模式（保持选中点相对手指的抓取偏移）。
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
      downScreen: screen,
      moved: false,
    };
  }

  /**
   * 进入双指模式：未选中=捏合缩放；已选中=只平移。
   */
  function beginTwoFingerMode(): void {
    if (activePointers.size !== 2) {
      return;
    }
    const points = [...activePointers.values()];
    const selected = callbacks.getSelectedVertexId();
    mode = {
      kind: 'pinch',
      lastDistance: Math.max(1, distance(points[0], points[1])),
      lastMidpoint: {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      },
      panOnly: selected !== null,
    };
  }

  /**
   * pointerdown。
   */
  function onPointerDown(event: PointerEvent): void {
    surface.setPointerCapture(event.pointerId);
    callbacks.onGraphInteract?.();
    const screen = eventToScreen(event);
    activePointers.set(event.pointerId, screen);

    if (activePointers.size >= 2) {
      // 从拖点切到双指前先结束本轮拖点结算
      if (mode.kind === 'drag-vertex') {
        callbacks.onDragEnd();
      }
      beginTwoFingerMode();
      callbacks.onChange();
      return;
    }

    const selected = callbacks.getSelectedVertexId();
    if (selected !== null) {
      beginDragVertex(event.pointerId, screen, selected);
    } else {
      mode = {
        kind: 'pan',
        pointerId: event.pointerId,
        lastScreen: screen,
        downScreen: screen,
        moved: false,
      };
    }
    callbacks.onChange();
  }

  /**
   * pointermove。
   */
  function onPointerMove(event: PointerEvent): void {
    if (!activePointers.has(event.pointerId)) {
      return;
    }
    const screen = eventToScreen(event);
    activePointers.set(event.pointerId, screen);

    if (activePointers.size >= 2) {
      if (mode.kind !== 'pinch') {
        if (mode.kind === 'drag-vertex') {
          callbacks.onDragEnd();
        }
        beginTwoFingerMode();
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
      if (
        !mode.moved &&
        distance(screen, mode.downScreen) > TAP_MOVE_PX
      ) {
        mode.moved = true;
      }
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
      if (
        !mode.moved &&
        distance(screen, mode.downScreen) > TAP_MOVE_PX
      ) {
        mode.moved = true;
      }
      camera.panByScreenDelta(dx, dy);
      mode.lastScreen = screen;
      callbacks.onChange();
    }
  }

  /**
   * pointerup / cancel。
   */
  function onPointerUp(event: PointerEvent): void {
    const screen = eventToScreen(event);
    const wasDrag =
      mode.kind === 'drag-vertex' && mode.pointerId === event.pointerId;
    const wasPanTap =
      mode.kind === 'pan' &&
      mode.pointerId === event.pointerId &&
      !mode.moved &&
      distance(screen, mode.downScreen) <= TAP_MOVE_PX;

    activePointers.delete(event.pointerId);

    if (wasDrag) {
      callbacks.onDragEnd();
      // 拖点松手即取消选中（无需再点空白）
      callbacks.setSelectedVertexId(null);
    }

    if (wasPanTap) {
      const hit = hitTestVertex(screen, getDeal());
      callbacks.setSelectedVertexId(hit);
    }

    if (activePointers.size === 0) {
      mode = { kind: 'none' };
    } else if (activePointers.size === 1) {
      const [pointerId, lastScreen] = [...activePointers.entries()][0];
      const selected = callbacks.getSelectedVertexId();
      if (selected !== null) {
        // 双指变单指且仍选中：切到拖点
        beginDragVertex(pointerId, lastScreen, selected);
      } else {
        mode = {
          kind: 'pan',
          pointerId,
          lastScreen,
          downScreen: lastScreen,
          moved: true,
        };
      }
    } else {
      beginTwoFingerMode();
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
