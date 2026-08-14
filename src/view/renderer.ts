import { boundsOfVertices, crossingEdgeIndices, findCrossings } from '../core/crossings';
import type { Deal } from '../core/types';
import type { Camera } from './camera';

export type RenderTheme = {
  background: string;
  edge: string;
  edgeCrossing: string;
  vertex: string;
  vertexStroke: string;
  vertexActive: string;
};

/** A0 默认配色（包装阶段可换主题）。 */
export const DEFAULT_THEME: RenderTheme = {
  background: '#0f1419',
  edge: '#8b9bb4',
  edgeCrossing: '#e85d4c',
  vertex: '#e8eef7',
  vertexStroke: '#2a3340',
  vertexActive: '#5ec8ff',
};

/**
 * 将当前局绘制到 canvas（世界坐标经相机变换）。
 */
export function renderDeal(
  ctx: CanvasRenderingContext2D,
  deal: Deal,
  camera: Camera,
  options: {
    theme?: RenderTheme;
    activeVertexId?: number | null;
    solved?: boolean;
  } = {},
): void {
  const theme = options.theme ?? DEFAULT_THEME;
  const crossings = findCrossings(deal);
  const hotEdges = crossingEdgeIndices(crossings);

  // 先按设备像素清空整块缓冲，再按 DPR 进入 CSS 像素坐标系绘制
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(camera.dpr, 0, 0, camera.dpr, 0, 0);

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, camera.width, camera.height);

  // 边
  for (let i = 0; i < deal.edges.length; i += 1) {
    const edge = deal.edges[i];
    const a = camera.worldToScreen(deal.vertices[edge.a].position);
    const b = camera.worldToScreen(deal.vertices[edge.b].position);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = hotEdges.has(i) ? theme.edgeCrossing : theme.edge;
    ctx.lineWidth = hotEdges.has(i) ? 2.5 : 1.75;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // 顶点
  const radius = Math.max(6, 10 * Math.min(1.2, camera.scale / 0.8));
  for (const v of deal.vertices) {
    const p = camera.worldToScreen(v.position);
    const active = options.activeVertexId === v.id;
    ctx.beginPath();
    ctx.arc(p.x, p.y, active ? radius * 1.15 : radius, 0, Math.PI * 2);
    ctx.fillStyle = active ? theme.vertexActive : theme.vertex;
    ctx.fill();
    ctx.strokeStyle = theme.vertexStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (options.solved) {
    ctx.fillStyle = 'rgba(46, 160, 100, 0.18)';
    ctx.fillRect(0, 0, camera.width, camera.height);
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
