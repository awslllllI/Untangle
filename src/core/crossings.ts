import {
  aabbOverlap,
  segmentAabb,
  segmentsIntersectProper,
} from './geometry';
import type { CrossingPair, Deal, Edge, Vec2 } from './types';

/**
 * 计算当前嵌入下所有边交叉对（不共享顶点的边若线段相交则记一对）。
 */
export function findCrossings(deal: Deal): CrossingPair[] {
  const { vertices, edges } = deal;
  const crossings: CrossingPair[] = [];

  for (let i = 0; i < edges.length; i += 1) {
    const e1 = edges[i];
    const p1 = vertices[e1.a].position;
    const q1 = vertices[e1.b].position;
    const box1 = segmentAabb(p1, q1);

    for (let j = i + 1; j < edges.length; j += 1) {
      const e2 = edges[j];
      if (edgesShareVertex(e1, e2)) {
        continue;
      }
      const p2 = vertices[e2.a].position;
      const q2 = vertices[e2.b].position;
      const box2 = segmentAabb(p2, q2);
      if (
        !aabbOverlap(
          box1.minX,
          box1.minY,
          box1.maxX,
          box1.maxY,
          box2.minX,
          box2.minY,
          box2.maxX,
          box2.maxY,
        )
      ) {
        continue;
      }
      if (segmentsIntersectProper(p1, q1, p2, q2)) {
        crossings.push({ edgeIndexA: i, edgeIndexB: j });
      }
    }
  }

  return crossings;
}

/**
 * 判断当前局是否已无交叉（通关）。
 */
export function isSolved(deal: Deal): boolean {
  return findCrossings(deal).length === 0;
}

/**
 * 收集出现交叉的边下标集合，便于高亮。
 */
export function crossingEdgeIndices(crossings: CrossingPair[]): Set<number> {
  const set = new Set<number>();
  for (const c of crossings) {
    set.add(c.edgeIndexA);
    set.add(c.edgeIndexB);
  }
  return set;
}

/**
 * 两无向边是否共享顶点。
 */
function edgesShareVertex(a: Edge, b: Edge): boolean {
  return a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b;
}

/**
 * 轴对齐包围盒：所有顶点位置的范围。
 */
export function boundsOfVertices(positions: readonly Vec2[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 可增量维护的交叉状态：拖点时只重算与该点关联的边。
 */
export class CrossingTracker {
  /** 每条边当前与之交叉的边集合。 */
  private readonly partners: Array<Set<number>> = [];
  private readonly hotEdges = new Set<number>();
  private incidentCache: number[][] = [];
  private pairCount = 0;

  /**
   * 对新一局做全量重建。
   */
  public rebuild(deal: Deal): void {
    this.partners.length = 0;
    for (let i = 0; i < deal.edges.length; i += 1) {
      this.partners.push(new Set());
    }
    this.hotEdges.clear();
    this.pairCount = 0;
    this.incidentCache = buildIncidentEdgeLists(deal);

    const crossings = findCrossings(deal);
    for (const c of crossings) {
      this.addPair(c.edgeIndexA, c.edgeIndexB);
    }
  }

  /**
   * 顶点拖动后：仅更新与该顶点关联边的交叉。
   */
  public updateAfterVertexMove(deal: Deal, vertexId: number): void {
    if (
      vertexId < 0 ||
      vertexId >= deal.vertices.length ||
      this.incidentCache.length !== deal.vertices.length ||
      this.partners.length !== deal.edges.length
    ) {
      this.rebuild(deal);
      return;
    }

    const incident = this.incidentCache[vertexId];
    if (!incident || incident.length === 0) {
      return;
    }

    for (const edgeIndex of incident) {
      this.clearPairsForEdge(edgeIndex);
    }

    const { vertices, edges } = deal;
    for (const i of incident) {
      const e1 = edges[i];
      const p1 = vertices[e1.a].position;
      const q1 = vertices[e1.b].position;
      const box1 = segmentAabb(p1, q1);

      for (let j = 0; j < edges.length; j += 1) {
        if (j === i) {
          continue;
        }
        const e2 = edges[j];
        if (edgesShareVertex(e1, e2)) {
          continue;
        }
        const p2 = vertices[e2.a].position;
        const q2 = vertices[e2.b].position;
        const box2 = segmentAabb(p2, q2);
        if (
          !aabbOverlap(
            box1.minX,
            box1.minY,
            box1.maxX,
            box1.maxY,
            box2.minX,
            box2.minY,
            box2.maxX,
            box2.maxY,
          )
        ) {
          continue;
        }
        if (segmentsIntersectProper(p1, q1, p2, q2)) {
          this.addPair(i, j);
        }
      }
    }
  }

  /**
   * 当前交叉边集合（供渲染高亮）。
   */
  public getHotEdges(): ReadonlySet<number> {
    return this.hotEdges;
  }

  /**
   * 当前交叉对数。
   */
  public getCrossingCount(): number {
    return this.pairCount;
  }

  /**
   * 是否已无交叉。
   */
  public isSolved(): boolean {
    return this.pairCount === 0;
  }

  /**
   * 登记一对交叉边（幂等）。
   */
  private addPair(a: number, b: number): void {
    if (a === b) {
      return;
    }
    if (this.partners[a].has(b)) {
      return;
    }
    this.partners[a].add(b);
    this.partners[b].add(a);
    this.pairCount += 1;
    this.hotEdges.add(a);
    this.hotEdges.add(b);
  }

  /**
   * 清除某条边的全部交叉关系。
   */
  private clearPairsForEdge(edgeIndex: number): void {
    const partnerSet = this.partners[edgeIndex];
    if (!partnerSet || partnerSet.size === 0) {
      return;
    }
    for (const other of partnerSet) {
      this.partners[other].delete(edgeIndex);
      this.pairCount -= 1;
      if (this.partners[other].size === 0) {
        this.hotEdges.delete(other);
      }
    }
    partnerSet.clear();
    this.hotEdges.delete(edgeIndex);
  }
}

/**
 * 为每个顶点建立关联边下标列表。
 */
function buildIncidentEdgeLists(deal: Deal): number[][] {
  const lists: number[][] = Array.from({ length: deal.vertices.length }, () => []);
  for (let i = 0; i < deal.edges.length; i += 1) {
    const e = deal.edges[i];
    lists[e.a].push(i);
    lists[e.b].push(i);
  }
  return lists;
}
