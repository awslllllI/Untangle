/**
 * 解缠领域的基础几何与图结构类型。
 */

/** 二维点（世界坐标）。 */
export type Vec2 = {
  x: number;
  y: number;
};

/** 顶点：可变位置，用于玩家拖点。 */
export type Vertex = {
  id: number;
  position: Vec2;
};

/** 无向边，端点为顶点 id。 */
export type Edge = {
  a: number;
  b: number;
};

/** 一局解缠的可变状态。 */
export type Deal = {
  /** 顶点列表（id 与下标一致）。 */
  vertices: Vertex[];
  /** 边集（保证对应平面图）。 */
  edges: Edge[];
  /** 生成用随机源，供日后编入种子（A1）。 */
  generationSeed: number;
};

/** 一对相交边（用边在数组中的下标标识）。 */
export type CrossingPair = {
  edgeIndexA: number;
  edgeIndexB: number;
};

/** 顶点数硬顶（产品约定）。 */
export const VERTEX_COUNT_HARD_CAP = 200;

/** A0 阶段建议上限（性能与手感未冲到 200 前）。 */
export const VERTEX_COUNT_A0_CAP = 15;

/** 允许的最小顶点数（至少构成可玩平面图）。 */
export const VERTEX_COUNT_MIN = 4;
