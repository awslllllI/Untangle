import { boundsOfVertices } from '../core/crossings';
import { collectVertexNeighborhood } from '../core/neighborhood';
import type { Deal } from '../core/types';
import type { Camera } from './camera';

export type RenderTheme = {
  background: string;
  edge: string;
  edgeCrossing: string;
  edgeLinked: string;
  edgeLinkedCrossing: string;
  vertex: string;
  vertexStroke: string;
  vertexActive: string;
  vertexLinked: string;
  vertexLinkedStroke: string;
};

/** 默认配色（包装阶段可换主题）。 */
export const DEFAULT_THEME: RenderTheme = {
  background: '#0f1419',
  edge: '#8b9bb4',
  edgeCrossing: '#e85d4c',
  edgeLinked: '#3dd6c6',
  edgeLinkedCrossing: '#ffb454',
  vertex: '#e8eef7',
  vertexStroke: '#2a3340',
  vertexActive: '#5ec8ff',
  vertexLinked: '#7aefe3',
  vertexLinkedStroke: '#1a6b64',
};

/**
 * 将当前局绘制到 canvas（世界坐标经相机变换）。
 * hotEdges 由 CrossingTracker 提供；选中点时高亮其邻边与邻点。
 */
export function renderDeal(
  ctx: CanvasRenderingContext2D,
  deal: Deal,
  camera: Camera,
  options: {
    theme?: RenderTheme;
    activeVertexId?: number | null;
    solved?: boolean;
    hotEdges?: ReadonlySet<number>;
  } = {},
): void {
  const theme = options.theme ?? DEFAULT_THEME;
  const hotEdges = options.hotEdges ?? new Set<number>();
  const activeId = options.activeVertexId ?? null;
  const { edgeIndices: linkedEdges, neighborIds: linkedVertices } =
    collectVertexNeighborhood(deal, activeId);
  const n = deal.vertices.length;
  const drawStroke = n < 80 || camera.scale > 0.55;

  // 先按设备像素清空整块缓冲，再按 DPR 进入 CSS 像素坐标系绘制
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(camera.dpr, 0, 0, camera.dpr, 0, 0);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, camera.width, camera.height);

  // 边：普通 → 交叉 → 邻接（邻接叠在最上，便于看清选中关系）
  drawEdgesLayer(ctx, deal, camera, theme, n, (i) => !hotEdges.has(i) && !linkedEdges.has(i));
  drawEdgesLayer(ctx, deal, camera, theme, n, (i) => hotEdges.has(i) && !linkedEdges.has(i), {
    stroke: theme.edgeCrossing,
    width: 2.5,
  });
  drawEdgesLayer(ctx, deal, camera, theme, n, (i) => linkedEdges.has(i), {
    stroke: (i) => (hotEdges.has(i) ? theme.edgeLinkedCrossing : theme.edgeLinked),
    width: 3.25,
  });

  // 顶点：大图缩小时略缩小半径，减少 overdraw
  const radius = Math.max(
    n > 100 ? 4 : 6,
    (n > 100 ? 7 : 10) * Math.min(1.2, camera.scale / 0.8),
  );

  for (const v of deal.vertices) {
    if (v.id === activeId || linkedVertices.has(v.id)) {
      continue;
    }
    drawVertex(ctx, camera, theme, v.position, radius, 'normal', drawStroke);
  }

  for (const v of deal.vertices) {
    if (!linkedVertices.has(v.id) || v.id === activeId) {
      continue;
    }
    drawVertex(ctx, camera, theme, v.position, radius * 1.08, 'linked', true);
  }

  if (activeId != null) {
    const active = deal.vertices[activeId];
    if (active) {
      drawVertex(ctx, camera, theme, active.position, radius * 1.2, 'active', true);
    }
  }

  if (options.solved) {
    ctx.fillStyle = 'rgba(46, 160, 100, 0.18)';
    ctx.fillRect(0, 0, camera.width, camera.height);
  }
}

type EdgeStyle = {
  stroke: string | ((edgeIndex: number) => string);
  width: number;
};

/**
 * 按谓词绘制一层边。
 */
function drawEdgesLayer(
  ctx: CanvasRenderingContext2D,
  deal: Deal,
  camera: Camera,
  theme: RenderTheme,
  n: number,
  include: (edgeIndex: number) => boolean,
  style?: EdgeStyle,
): void {
  const defaultWidth = n > 60 ? 1.25 : 1.75;
  for (let i = 0; i < deal.edges.length; i += 1) {
    if (!include(i)) {
      continue;
    }
    const edge = deal.edges[i];
    const a = camera.worldToScreen(deal.vertices[edge.a].position);
    const b = camera.worldToScreen(deal.vertices[edge.b].position);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    if (style) {
      ctx.strokeStyle =
        typeof style.stroke === 'function' ? style.stroke(i) : style.stroke;
      ctx.lineWidth = style.width;
    } else {
      ctx.strokeStyle = theme.edge;
      ctx.lineWidth = defaultWidth;
    }
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

/**
 * 绘制单个顶点。
 */
function drawVertex(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  theme: RenderTheme,
  worldPos: { x: number; y: number },
  radius: number,
  kind: 'normal' | 'linked' | 'active',
  withStroke: boolean,
): void {
  const p = camera.worldToScreen(worldPos);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  if (kind === 'active') {
    ctx.fillStyle = theme.vertexActive;
  } else if (kind === 'linked') {
    ctx.fillStyle = theme.vertexLinked;
  } else {
    ctx.fillStyle = theme.vertex;
  }
  ctx.fill();
  if (withStroke) {
    ctx.strokeStyle =
      kind === 'linked' ? theme.vertexLinkedStroke : theme.vertexStroke;
    ctx.lineWidth = kind === 'active' ? 2.5 : 2;
    ctx.stroke();
  }
}

/**
 * 根据顶点包围盒重置相机视野。
 */
export function resetCameraToDeal(camera: Camera, deal: Deal): void {
  const positions = deal.vertices.map((v) => v.position);
  const b = boundsOfVertices(positions);
  camera.fitBounds(b.minX, b.minY, b.maxX, b.maxY);
}
