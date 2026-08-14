import type { Deal } from './types';

/** 某顶点的一阶邻域：关联边与相邻顶点。 */
export type VertexNeighborhood = {
  edgeIndices: Set<number>;
  neighborIds: Set<number>;
};

/**
 * 收集与指定顶点直接相连的边下标与邻点 id。
 */
export function collectVertexNeighborhood(
  deal: Deal,
  vertexId: number | null | undefined,
): VertexNeighborhood {
  const edgeIndices = new Set<number>();
  const neighborIds = new Set<number>();
  if (vertexId == null || vertexId < 0 || vertexId >= deal.vertices.length) {
    return { edgeIndices, neighborIds };
  }

  for (let i = 0; i < deal.edges.length; i += 1) {
    const e = deal.edges[i];
    if (e.a === vertexId) {
      edgeIndices.add(i);
      neighborIds.add(e.b);
    } else if (e.b === vertexId) {
      edgeIndices.add(i);
      neighborIds.add(e.a);
    }
  }

  return { edgeIndices, neighborIds };
}
