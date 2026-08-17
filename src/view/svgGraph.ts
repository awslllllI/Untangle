import type { Deal } from '../core/types';
import type { Camera } from './camera';
import { DEFAULT_THEME } from './theme';

const NS = 'http://www.w3.org/2000/svg';

/** 顶点在世界坐标下的基础半径（随相机 scale 放大到屏幕上）。 */
export const VERTEX_RADIUS_WORLD = 9;

/** 选中顶点相对基础半径的放大。 */
const ACTIVE_RADIUS_WORLD = 11;

/** 邻点相对基础半径的放大（仅作引导，不改边样式）。 */
const LINKED_RADIUS_WORLD = 10;

/**
 * SVG 矢量图场景：相机只改 transform；选中高亮邻点，不改边的粗细/亮度。
 */
export class SvgGraphView {
  private readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly edgesLayer: SVGGElement;
  private readonly verticesLayer: SVGGElement;
  private edgeEls: SVGLineElement[] = [];
  private vertexEls: SVGCircleElement[] = [];
  private incidentCache: number[][] = [];
  private activeVertexId: number | null = null;
  private linkedNeighborIds: number[] = [];

  /**
   * 绑定页面上的 SVG 根节点。
   */
  public constructor(svg: SVGSVGElement) {
    this.svg = svg;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '解缠画布');

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    this.world = document.createElementNS(NS, 'g');
    this.edgesLayer = document.createElementNS(NS, 'g');
    this.verticesLayer = document.createElementNS(NS, 'g');
    this.world.appendChild(this.edgesLayer);
    this.world.appendChild(this.verticesLayer);
    svg.appendChild(this.world);
  }

  /**
   * 按新一局重建全部边与顶点元素。
   */
  public rebuild(deal: Deal): void {
    this.edgesLayer.replaceChildren();
    this.verticesLayer.replaceChildren();
    this.edgeEls = [];
    this.vertexEls = [];
    this.incidentCache = Array.from({ length: deal.vertices.length }, () => []);
    this.activeVertexId = null;
    this.linkedNeighborIds = [];

    for (let i = 0; i < deal.edges.length; i += 1) {
      const e = deal.edges[i];
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('stroke', DEFAULT_THEME.edge);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      line.setAttribute('fill', 'none');
      this.edgesLayer.appendChild(line);
      this.edgeEls.push(line);
      this.incidentCache[e.a].push(i);
      this.incidentCache[e.b].push(i);
    }

    for (const v of deal.vertices) {
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('r', String(VERTEX_RADIUS_WORLD));
      circle.setAttribute('fill', DEFAULT_THEME.vertex);
      circle.setAttribute('stroke', DEFAULT_THEME.vertexStroke);
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('vector-effect', 'non-scaling-stroke');
      circle.dataset.vertexId = String(v.id);
      this.verticesLayer.appendChild(circle);
      this.vertexEls.push(circle);
    }

    this.syncAllGeometry(deal);
  }

  /**
   * 同步相机：仅更新世界组 transform（平移/缩放不重画几何）。
   */
  public syncCamera(camera: Camera): void {
    const t = `translate(${camera.width / 2} ${camera.height / 2}) scale(${camera.scale}) translate(${-camera.center.x} ${-camera.center.y})`;
    this.world.setAttribute('transform', t);
    this.svg.setAttribute('viewBox', `0 0 ${camera.width} ${camera.height}`);
    this.svg.setAttribute('width', String(camera.width));
    this.svg.setAttribute('height', String(camera.height));
  }

  /**
   * 全量同步顶点与边的几何位置。
   */
  public syncAllGeometry(deal: Deal): void {
    for (const v of deal.vertices) {
      const el = this.vertexEls[v.id];
      if (!el) {
        continue;
      }
      el.setAttribute('cx', String(v.position.x));
      el.setAttribute('cy', String(v.position.y));
    }
    for (let i = 0; i < deal.edges.length; i += 1) {
      this.syncEdgeGeometry(deal, i);
    }
  }

  /**
   * 拖点后只更新该点及其关联边（避免每帧改全部 DOM）。
   */
  public syncVertexDrag(deal: Deal, vertexId: number): void {
    const v = deal.vertices[vertexId];
    const el = this.vertexEls[vertexId];
    if (v && el) {
      el.setAttribute('cx', String(v.position.x));
      el.setAttribute('cy', String(v.position.y));
    }
    const incident = this.incidentCache[vertexId] ?? [];
    for (const edgeIndex of incident) {
      this.syncEdgeGeometry(deal, edgeIndex);
    }
  }

  /**
   * 按交叉集合更新边颜色；粗细与选中态无关。
   */
  public syncCrossings(hotEdges: ReadonlySet<number>): void {
    for (let i = 0; i < this.edgeEls.length; i += 1) {
      const line = this.edgeEls[i];
      line.setAttribute(
        'stroke',
        hotEdges.has(i) ? DEFAULT_THEME.edgeCrossing : DEFAULT_THEME.edge,
      );
    }
  }

  /**
   * 高亮当前点与邻点（只改点填充/半径，不改边样式）。
   */
  public setActiveVertex(deal: Deal, vertexId: number | null): void {
    this.clearVertexHighlights();
    this.activeVertexId = vertexId;
    this.linkedNeighborIds = [];

    if (vertexId === null) {
      return;
    }

    const activeEl = this.vertexEls[vertexId];
    if (activeEl) {
      activeEl.setAttribute('fill', DEFAULT_THEME.vertexActive);
      activeEl.setAttribute('r', String(ACTIVE_RADIUS_WORLD));
    }

    const neighbors = new Set<number>();
    for (const edgeIndex of this.incidentCache[vertexId] ?? []) {
      const e = deal.edges[edgeIndex];
      if (!e) {
        continue;
      }
      neighbors.add(e.a === vertexId ? e.b : e.a);
    }

    for (const id of neighbors) {
      const el = this.vertexEls[id];
      if (!el) {
        continue;
      }
      el.setAttribute('fill', DEFAULT_THEME.vertexLinked);
      el.setAttribute('stroke', DEFAULT_THEME.vertexLinkedStroke);
      el.setAttribute('r', String(LINKED_RADIUS_WORLD));
      this.linkedNeighborIds.push(id);
    }
  }

  /**
   * 通关时切换背景提示色。
   */
  public setSolved(solved: boolean): void {
    this.svg.style.backgroundColor = solved ? '#143022' : DEFAULT_THEME.background;
  }

  /**
   * 清除活动点与邻点的高亮样式。
   */
  private clearVertexHighlights(): void {
    if (this.activeVertexId !== null) {
      const prev = this.vertexEls[this.activeVertexId];
      if (prev) {
        prev.setAttribute('fill', DEFAULT_THEME.vertex);
        prev.setAttribute('stroke', DEFAULT_THEME.vertexStroke);
        prev.setAttribute('r', String(VERTEX_RADIUS_WORLD));
      }
    }
    for (const id of this.linkedNeighborIds) {
      const el = this.vertexEls[id];
      if (!el) {
        continue;
      }
      el.setAttribute('fill', DEFAULT_THEME.vertex);
      el.setAttribute('stroke', DEFAULT_THEME.vertexStroke);
      el.setAttribute('r', String(VERTEX_RADIUS_WORLD));
    }
  }

  /**
   * 写入单条边的端点坐标。
   */
  private syncEdgeGeometry(deal: Deal, edgeIndex: number): void {
    const e = deal.edges[edgeIndex];
    const line = this.edgeEls[edgeIndex];
    if (!e || !line) {
      return;
    }
    const a = deal.vertices[e.a].position;
    const b = deal.vertices[e.b].position;
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
  }
}
