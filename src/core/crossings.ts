import { segmentsIntersectProper } from './geometry';
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

    for (let j = i + 1; j < edges.length; j += 1) {
      const e2 = edges[j];
      if (edgesShareVertex(e1, e2)) {
        continue;
      }
      const p2 = vertices[e2.a].position;
      const q2 = vertices[e2.b].position;
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
