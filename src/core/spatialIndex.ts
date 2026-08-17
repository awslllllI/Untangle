import type { Deal, Vec2 } from './types';
import { segmentAabb } from './geometry';

/**
 * 均匀网格：按边的 AABB 挂桶，供拖点时快速取出候选边。
 */
export class EdgeSpatialIndex {
  private cellSize = 80;
  private readonly buckets = new Map<string, number[]>();
  private edgeCount = 0;

  /**
   * 用当前局全部边重建索引（换局或全量重建时调用）。
   */
  public rebuild(deal: Deal): void {
    this.buckets.clear();
    this.edgeCount = deal.edges.length;
    if (deal.edges.length === 0) {
      return;
    }

    this.cellSize = estimateCellSize(deal);
    const inv = 1 / this.cellSize;

    for (let i = 0; i < deal.edges.length; i += 1) {
      const e = deal.edges[i];
      const a = deal.vertices[e.a].position;
      const b = deal.vertices[e.b].position;
      this.insertEdge(i, a, b, inv);
    }
  }

  /**
   * 查询与给定 AABB 可能相交的边下标（可含自身，调用方过滤）。
   */
  public queryAabb(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: number[],
    seen: Uint8Array,
  ): void {
    out.length = 0;
    const inv = 1 / this.cellSize;
    const x0 = Math.floor(minX * inv);
    const y0 = Math.floor(minY * inv);
    const x1 = Math.floor(maxX * inv);
    const y1 = Math.floor(maxY * inv);

    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gy = y0; gy <= y1; gy += 1) {
        const bucket = this.buckets.get(cellKey(gx, gy));
        if (!bucket) {
          continue;
        }
        for (const edgeIndex of bucket) {
          if (seen[edgeIndex]) {
            continue;
          }
          seen[edgeIndex] = 1;
          out.push(edgeIndex);
        }
      }
    }

    for (const edgeIndex of out) {
      seen[edgeIndex] = 0;
    }
  }

  /**
   * 当前索引覆盖的边数量。
   */
  public getEdgeCount(): number {
    return this.edgeCount;
  }

  /**
   * 将一条边插入其 AABB 覆盖的格子。
   */
  private insertEdge(edgeIndex: number, a: Vec2, b: Vec2, inv: number): void {
    const box = segmentAabb(a, b);
    const x0 = Math.floor(box.minX * inv);
    const y0 = Math.floor(box.minY * inv);
    const x1 = Math.floor(box.maxX * inv);
    const y1 = Math.floor(box.maxY * inv);
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let gy = y0; gy <= y1; gy += 1) {
        const key = cellKey(gx, gy);
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(edgeIndex);
      }
    }
  }
}

/**
 * 网格键。
 */
function cellKey(gx: number, gy: number): string {
  return `${gx}:${gy}`;
}

/**
 * 按顶点包围盒估计格子边长，避免过碎或过粗。
 */
function estimateCellSize(deal: Deal): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of deal.vertices) {
    minX = Math.min(minX, v.position.x);
    minY = Math.min(minY, v.position.y);
    maxX = Math.max(maxX, v.position.x);
    maxY = Math.max(maxY, v.position.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  // 约 24～48 格一边，兼顾查询与内存
  return Math.max(40, span / 32);
}
