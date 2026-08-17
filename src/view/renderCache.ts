import { boundsOfVertices } from '../core/crossings';
import { collectVertexNeighborhood } from '../core/neighborhood';
import type { Deal, Vec2 } from '../core/types';
import type { Camera } from './camera';
import { DEFAULT_THEME, type RenderTheme } from './theme';

/** 离屏缓存允许的最大边长，避免显存爆炸。 */
const MAX_CACHE_SIDE = 4096;

/**
 * 图内容位图缓存：平移/缩放时尽量只 drawImage，避免每帧数百次 stroke。
 */
export class GraphPaintCache {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private valid = false;
  private originX = 0;
  private originY = 0;
  private ppm = 1;
  private bakedCameraScale = 1;
  private excludeVertexId: number | null = null;

  /**
   * 创建离屏画布。
   */
  public constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建离屏 2D 上下文');
    }
    this.ctx = ctx;
  }

  /**
   * 使缓存失效（换局、松手、样式需重烘焙时）。
   */
  public invalidate(): void {
    this.valid = false;
  }

  /**
   * 开始拖某顶点：静态层排除其关联边与邻点。
   */
  public beginDrag(vertexId: number): void {
    this.excludeVertexId = vertexId;
    this.valid = false;
  }

  /**
   * 结束拖点并准备全量重烘焙。
   */
  public endDrag(): void {
    this.excludeVertexId = null;
    this.valid = false;
  }

  /**
   * 绘制一帧：优先 blit 缓存；必要时重烘焙。
   */
  public paint(
    screenCtx: CanvasRenderingContext2D,
    deal: Deal,
    camera: Camera,
    options: {
      theme?: RenderTheme;
      activeVertexId?: number | null;
      solved?: boolean;
      hotEdges?: ReadonlySet<number>;
    },
  ): void {
    const theme = options.theme ?? DEFAULT_THEME;
    const hotEdges = options.hotEdges ?? new Set<number>();
    const activeId = options.activeVertexId ?? null;

    if (!this.valid) {
      this.bake(deal, camera, theme, hotEdges, activeId);
    }

    screenCtx.setTransform(1, 0, 0, 1, 0, 0);
    screenCtx.clearRect(0, 0, screenCtx.canvas.width, screenCtx.canvas.height);
    screenCtx.setTransform(camera.dpr, 0, 0, camera.dpr, 0, 0);
    screenCtx.fillStyle = theme.background;
    screenCtx.fillRect(0, 0, camera.width, camera.height);

    const topLeft = camera.worldToScreen({ x: this.originX, y: this.originY });
    const screenW = (this.canvas.width / this.ppm) * camera.scale;
    const screenH = (this.canvas.height / this.ppm) * camera.scale;
    screenCtx.imageSmoothingEnabled = camera.scale < this.bakedCameraScale * 1.2;
    screenCtx.drawImage(this.canvas, topLeft.x, topLeft.y, screenW, screenH);

    if (this.excludeVertexId != null) {
      paintDragOverlay(screenCtx, deal, camera, theme, hotEdges, this.excludeVertexId);
    }

    if (options.solved) {
      screenCtx.fillStyle = 'rgba(46, 160, 100, 0.18)';
      screenCtx.fillRect(0, 0, camera.width, camera.height);
    }
  }

  /**
   * 将当前图烘焙到离屏画布。
   */
  private bake(
    deal: Deal,
    camera: Camera,
    theme: RenderTheme,
    hotEdges: ReadonlySet<number>,
    activeId: number | null,
  ): void {
    const excluded = collectVertexNeighborhood(deal, this.excludeVertexId);
    const activeNb =
      this.excludeVertexId == null && activeId != null
        ? collectVertexNeighborhood(deal, activeId)
        : null;

    const positions = deal.vertices.map((v) => v.position);
    const bounds = boundsOfVertices(positions);
    const pad = Math.max(40, (bounds.maxX - bounds.minX) * 0.08);
    this.originX = bounds.minX - pad;
    this.originY = bounds.minY - pad;
    const worldW = Math.max(1, bounds.maxX - bounds.minX + pad * 2);
    const worldH = Math.max(1, bounds.maxY - bounds.minY + pad * 2);

    const targetPpm = Math.min(4, Math.max(0.75, camera.scale * Math.min(2, camera.dpr)));
    let ppm = targetPpm;
    let cw = Math.ceil(worldW * ppm);
    let ch = Math.ceil(worldH * ppm);
    if (cw > MAX_CACHE_SIDE || ch > MAX_CACHE_SIDE) {
      const shrink = MAX_CACHE_SIDE / Math.max(cw, ch);
      ppm *= shrink;
      cw = Math.ceil(worldW * ppm);
      ch = Math.ceil(worldH * ppm);
    }

    this.ppm = ppm;
    this.bakedCameraScale = camera.scale;
    this.canvas.width = Math.max(1, cw);
    this.canvas.height = Math.max(1, ch);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    // 透明底，屏幕层已铺背景，避免缩放 blit 露边
    ctx.clearRect(0, 0, cw, ch);

    const toCache = (p: Vec2): Vec2 => ({
      x: (p.x - this.originX) * ppm,
      y: (p.y - this.originY) * ppm,
    });

    const n = deal.vertices.length;
    const widthScale = ppm / Math.max(0.75, camera.scale);
    const baseWidth = Math.max(1, (n > 60 ? 1.25 : 1.75) * widthScale);

    const normalPath = new Path2D();
    const hotPath = new Path2D();
    const linkedPath = new Path2D();
    const linkedHotPath = new Path2D();

    const dragging = this.excludeVertexId != null;

    for (let i = 0; i < deal.edges.length; i += 1) {
      if (excluded.edgeIndices.has(i)) {
        continue;
      }
      const e = deal.edges[i];
      const a = toCache(deal.vertices[e.a].position);
      const b = toCache(deal.vertices[e.b].position);

      // 拖点期间静态层只烤普通色，热边由前景按最新结果补画
      if (dragging) {
        normalPath.moveTo(a.x, a.y);
        normalPath.lineTo(b.x, b.y);
        continue;
      }

      const linked = activeNb?.edgeIndices.has(i) ?? false;
      const hot = hotEdges.has(i);
      const path = linked
        ? hot
          ? linkedHotPath
          : linkedPath
        : hot
          ? hotPath
          : normalPath;
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }

    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = baseWidth;
    ctx.stroke(normalPath);

    if (!dragging) {
      ctx.strokeStyle = theme.edgeCrossing;
      ctx.lineWidth = baseWidth * 1.4;
      ctx.stroke(hotPath);

      ctx.strokeStyle = theme.edgeLinked;
      ctx.lineWidth = baseWidth * 1.8;
      ctx.stroke(linkedPath);

      ctx.strokeStyle = theme.edgeLinkedCrossing;
      ctx.lineWidth = baseWidth * 1.8;
      ctx.stroke(linkedHotPath);
    }

    const radius = Math.max(n > 100 ? 3 : 5, (n > 100 ? 5 : 8) * widthScale);

    for (const v of deal.vertices) {
      if (v.id === this.excludeVertexId || excluded.neighborIds.has(v.id)) {
        continue;
      }
      const p = toCache(v.position);
      const isActive = !dragging && activeId === v.id;
      const isLinked = !dragging && (activeNb?.neighborIds.has(v.id) ?? false);

      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        isActive ? radius * 1.2 : isLinked ? radius * 1.08 : radius,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = isActive
        ? theme.vertexActive
        : isLinked
          ? theme.vertexLinked
          : theme.vertex;
      ctx.fill();
      if (n < 100 || isActive || isLinked) {
        ctx.strokeStyle = isLinked ? theme.vertexLinkedStroke : theme.vertexStroke;
        ctx.lineWidth = isActive ? 2.5 : 2;
        ctx.stroke();
      }
    }

    this.valid = true;
  }
}

/**
 * 拖点前景：关联边、当前热边、邻点与活动点。
 */
function paintDragOverlay(
  ctx: CanvasRenderingContext2D,
  deal: Deal,
  camera: Camera,
  theme: RenderTheme,
  hotEdges: ReadonlySet<number>,
  vertexId: number,
): void {
  const neighborhood = collectVertexNeighborhood(deal, vertexId);
  const view = {
    minX: -64,
    minY: -64,
    maxX: camera.width + 64,
    maxY: camera.height + 64,
  };
  const n = deal.vertices.length;

  ctx.lineCap = 'round';

  const linkedPath = new Path2D();
  const linkedHotPath = new Path2D();
  const hotPath = new Path2D();

  for (let i = 0; i < deal.edges.length; i += 1) {
    const linked = neighborhood.edgeIndices.has(i);
    const hot = hotEdges.has(i);
    if (!linked && !hot) {
      continue;
    }
    const e = deal.edges[i];
    const a = camera.worldToScreen(deal.vertices[e.a].position);
    const b = camera.worldToScreen(deal.vertices[e.b].position);
    if (!segmentHitsView(a, b, view)) {
      continue;
    }
    const path = linked ? (hot ? linkedHotPath : linkedPath) : hotPath;
    path.moveTo(a.x, a.y);
    path.lineTo(b.x, b.y);
  }

  ctx.strokeStyle = theme.edgeCrossing;
  ctx.lineWidth = 2.5;
  ctx.stroke(hotPath);

  ctx.strokeStyle = theme.edgeLinked;
  ctx.lineWidth = 3.25;
  ctx.stroke(linkedPath);

  ctx.strokeStyle = theme.edgeLinkedCrossing;
  ctx.lineWidth = 3.25;
  ctx.stroke(linkedHotPath);

  const radius = Math.max(
    n > 100 ? 4 : 6,
    (n > 100 ? 7 : 10) * Math.min(1.2, camera.scale / 0.8),
  );

  for (const id of neighborhood.neighborIds) {
    const v = deal.vertices[id];
    const p = camera.worldToScreen(v.position);
    if (!pointHitsView(p, view)) {
      continue;
    }
    drawDot(ctx, theme, p, radius * 1.08, 'linked');
  }

  const active = deal.vertices[vertexId];
  if (active) {
    drawDot(ctx, theme, camera.worldToScreen(active.position), radius * 1.2, 'active');
  }
}

/**
 * 屏幕线段是否可能落入视口。
 */
function segmentHitsView(
  a: Vec2,
  b: Vec2,
  view: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  const minX = a.x < b.x ? a.x : b.x;
  const maxX = a.x > b.x ? a.x : b.x;
  const minY = a.y < b.y ? a.y : b.y;
  const maxY = a.y > b.y ? a.y : b.y;
  return minX <= view.maxX && maxX >= view.minX && minY <= view.maxY && maxY >= view.minY;
}

/**
 * 屏幕点是否在视口附近。
 */
function pointHitsView(
  p: Vec2,
  view: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return p.x >= view.minX && p.x <= view.maxX && p.y >= view.minY && p.y <= view.maxY;
}

/**
 * 画前景圆点。
 */
function drawDot(
  ctx: CanvasRenderingContext2D,
  theme: RenderTheme,
  p: Vec2,
  radius: number,
  kind: 'linked' | 'active',
): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = kind === 'active' ? theme.vertexActive : theme.vertexLinked;
  ctx.fill();
  ctx.strokeStyle = kind === 'linked' ? theme.vertexLinkedStroke : theme.vertexStroke;
  ctx.lineWidth = kind === 'active' ? 2.5 : 2;
  ctx.stroke();
}
