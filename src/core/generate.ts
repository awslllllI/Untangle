import { createRng, randomIndex, randomSeed, shuffleInPlace } from './rng';
import type { Deal, Edge, Vec2, Vertex } from './types';
import { VERTEX_COUNT_HARD_CAP, VERTEX_COUNT_MIN } from './types';

/** 生成时圆的默认半径（世界坐标）。 */
const CIRCLE_RADIUS = 400;

/**
 * 生成保证可解的平面图边集（供关卡制作；坐标另排）。
 */
export function createPlanarEdges(vertexCount: number, seed: number): Edge[] {
  const n = clampVertexCount(vertexCount);
  const rng = createRng(seed);
  return buildPlanarEdges(n, rng);
}

/**
 * 生成一局保证可解的解缠：平面图边集 + 圆上布局。
 */
export function createDeal(vertexCount: number, seed: number = randomSeed()): Deal {
  const n = clampVertexCount(vertexCount);
  const rng = createRng(seed);
  const edges = buildPlanarEdges(n, rng);
  const positions = layoutOnCircle(n, CIRCLE_RADIUS);
  const vertices: Vertex[] = positions.map((position, id) => ({ id, position }));

  return {
    vertices,
    edges,
    generationSeed: seed >>> 0,
  };
}

/**
 * 将顶点数限制在合法闭区间内。
 */
export function clampVertexCount(vertexCount: number): number {
  const rounded = Math.round(vertexCount);
  return Math.min(VERTEX_COUNT_HARD_CAP, Math.max(VERTEX_COUNT_MIN, rounded));
}

/**
 * 用增量三角面剖分构造平面图，再随机删边：保持连通且最低度数为 2。
 */
function buildPlanarEdges(n: number, rng: () => number): Edge[] {
  if (n < 3) {
    return [];
  }

  const edgeKeys = new Set<string>();
  const faces: Array<[number, number, number]> = [];

  addUndirectedEdge(edgeKeys, 0, 1);
  addUndirectedEdge(edgeKeys, 1, 2);
  addUndirectedEdge(edgeKeys, 2, 0);
  faces.push([0, 1, 2]);

  for (let v = 3; v < n; v += 1) {
    const faceIndex = randomIndex(rng, faces.length);
    const [a, b, c] = faces[faceIndex];
    faces.splice(faceIndex, 1);

    addUndirectedEdge(edgeKeys, v, a);
    addUndirectedEdge(edgeKeys, v, b);
    addUndirectedEdge(edgeKeys, v, c);

    faces.push([a, b, v], [b, c, v], [c, a, v]);
  }

  let edges = keysToEdges(edgeKeys);
  edges = thinEdgesKeepConnected(edges, n, rng);
  return edges;
}

/**
 * 将顶点均匀布在圆上（圆上布局；坐标不进种子）。
 */
function layoutOnCircle(n: number, radius: number): Vec2[] {
  const positions: Vec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return positions;
}

/**
 * 随机删边：保持连通，且每个顶点度数 ≥ 2。
 */
function thinEdgesKeepConnected(edges: Edge[], n: number, rng: () => number): Edge[] {
  const working = [...edges];
  shuffleInPlace(working, rng);

  // 度数 ≥ 2 时至少需要一个环，边数下界为 n
  const minEdges = n;
  const target = Math.max(minEdges, Math.floor(n * (1.6 + rng() * 0.6)));

  const kept: Edge[] = [];
  const keptKeys = new Set<string>();
  const degree = new Array<number>(n).fill(0);
  const parent = Array.from({ length: n }, (_, i) => i);

  /**
   * 边的无向键。
   */
  function edgeKey(e: Edge): string {
    return `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
  }

  /**
   * 并查集查找。
   */
  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }

  /**
   * 并查集合并；若已同根返回 false。
   */
  function union(a: number, b: number): boolean {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      return false;
    }
    parent[rb] = ra;
    return true;
  }

  /**
   * 将边加入结果并更新度数。
   */
  function keepEdge(e: Edge): void {
    const key = edgeKey(e);
    if (keptKeys.has(key)) {
      return;
    }
    keptKeys.add(key);
    kept.push(e);
    degree[e.a] += 1;
    degree[e.b] += 1;
  }

  // 先抽生成树保证连通
  for (const e of working) {
    if (union(e.a, e.b)) {
      keepEdge(e);
    }
  }

  // 再补边，把所有顶点度数抬到至少 2
  for (const e of working) {
    if (keptKeys.has(edgeKey(e))) {
      continue;
    }
    if (degree[e.a] < 2 || degree[e.b] < 2) {
      keepEdge(e);
    }
  }

  // 若仍有孤立度数不足（理论上极大平面图边集足够），继续扫一遍兜底
  for (const e of working) {
    if (degreesAllAtLeast(degree, 2)) {
      break;
    }
    if (keptKeys.has(edgeKey(e))) {
      continue;
    }
    if (degree[e.a] < 2 || degree[e.b] < 2) {
      keepEdge(e);
    }
  }

  // 最后加到目标密度
  for (const e of working) {
    if (kept.length >= target) {
      break;
    }
    keepEdge(e);
  }

  return kept;
}

/**
 * 是否所有顶点度数都达到下限。
 */
function degreesAllAtLeast(degree: readonly number[], min: number): boolean {
  for (const d of degree) {
    if (d < min) {
      return false;
    }
  }
  return true;
}


/**
 * 无向边写入集合（小 id 在前）。
 */
function addUndirectedEdge(keys: Set<string>, a: number, b: number): void {
  if (a === b) {
    return;
  }
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  keys.add(`${lo}-${hi}`);
}

/**
 * 边键集合转为边数组。
 */
function keysToEdges(keys: Set<string>): Edge[] {
  const edges: Edge[] = [];
  for (const key of keys) {
    const [a, b] = key.split('-').map(Number);
    edges.push({ a, b });
  }
  return edges;
}
