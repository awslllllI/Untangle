import type { Vec2 } from './types';

/**
 * 向量减法：a - b。
 */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * 二维叉积（z 分量）：用于定向与相交判定。
 */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * 点积。
 */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/**
 * 欧氏距离。
 */
export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * 判断点 q 是否在线段 ab 上（含端点，带容差）。
 */
export function pointOnSegment(q: Vec2, a: Vec2, b: Vec2, eps = 1e-9): boolean {
  const aq = sub(q, a);
  const ab = sub(b, a);
  if (Math.abs(cross(aq, ab)) > eps) {
    return false;
  }
  const d = dot(aq, ab);
  if (d < -eps) {
    return false;
  }
  return d <= dot(ab, ab) + eps;
}

/**
 * 判断线段 ab 与 cd 是否在内部相交（共享端点不算交叉）。
 */
export function segmentsIntersectProper(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
  eps = 1e-9,
): boolean {
  const ab = sub(b, a);
  const cd = sub(d, c);
  const ac = sub(c, a);
  const ad = sub(d, a);
  const ca = sub(a, c);
  const cb = sub(b, c);

  const c1 = cross(ab, ac);
  const c2 = cross(ab, ad);
  const c3 = cross(cd, ca);
  const c4 = cross(cd, cb);

  // 标准跨立：两端点在对方线段两侧
  if (
    ((c1 > eps && c2 < -eps) || (c1 < -eps && c2 > eps)) &&
    ((c3 > eps && c4 < -eps) || (c3 < -eps && c4 > eps))
  ) {
    return true;
  }

  // 共线重叠在解缠里极少出现；若端点落在另一线段内部也视为交叉
  if (Math.abs(c1) <= eps && pointOnSegment(c, a, b, eps) && !nearlyEqualPoint(c, a) && !nearlyEqualPoint(c, b)) {
    return true;
  }
  if (Math.abs(c2) <= eps && pointOnSegment(d, a, b, eps) && !nearlyEqualPoint(d, a) && !nearlyEqualPoint(d, b)) {
    return true;
  }
  if (Math.abs(c3) <= eps && pointOnSegment(a, c, d, eps) && !nearlyEqualPoint(a, c) && !nearlyEqualPoint(a, d)) {
    return true;
  }
  if (Math.abs(c4) <= eps && pointOnSegment(b, c, d, eps) && !nearlyEqualPoint(b, c) && !nearlyEqualPoint(b, d)) {
    return true;
  }

  return false;
}

/**
 * 两点是否近似重合。
 */
function nearlyEqualPoint(a: Vec2, b: Vec2, eps = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

/**
 * 判断两轴对齐包围盒是否相交（含边界）。
 */
export function aabbOverlap(
  aMinX: number,
  aMinY: number,
  aMaxX: number,
  aMaxY: number,
  bMinX: number,
  bMinY: number,
  bMaxX: number,
  bMaxY: number,
): boolean {
  return aMinX <= bMaxX && aMaxX >= bMinX && aMinY <= bMaxY && aMaxY >= bMinY;
}

/**
 * 线段端点的轴对齐包围盒。
 */
export function segmentAabb(
  a: Vec2,
  b: Vec2,
): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}
