import type { Deal, Edge, Vec2 } from './types';
import { VERTEX_COUNT_HARD_CAP, VERTEX_COUNT_MIN } from './types';

/** 关卡文件格式版本。 */
export const LEVEL_FORMAT_VERSION = 1;

/** 关卡种类：主线 / 皮肤演示 / 皮肤包。 */
export type LevelKind = 'mainline' | 'skin_demo' | 'skin';

/**
 * 手编关卡定义：边集 + 图形排布初始坐标。
 * 通关只判无交叉，不要求点回到原造型。
 */
export type LevelDef = {
  version: number;
  id: string;
  title: string;
  kind: LevelKind;
  /** 顶点世界坐标，下标即顶点 id。 */
  positions: Vec2[];
  /** 无向边端点 id。 */
  edges: Edge[];
};

/**
 * 从当前局快照导出关卡定义（含当前坐标）。
 */
export function levelFromDeal(
  deal: Deal,
  meta: { id: string; title: string; kind?: LevelKind },
): LevelDef {
  return {
    version: LEVEL_FORMAT_VERSION,
    id: meta.id.trim() || 'untitled',
    title: meta.title.trim() || '未命名关卡',
    kind: meta.kind ?? 'mainline',
    positions: deal.vertices.map((v) => ({ x: v.position.x, y: v.position.y })),
    edges: deal.edges.map((e) => ({ a: e.a, b: e.b })),
  };
}

/**
 * 将关卡实例化为可玩局（generationSeed 固定为 0，重开靠关卡定义）。
 */
export function dealFromLevel(level: LevelDef): Deal {
  const vertices = level.positions.map((position, id) => ({
    id,
    position: { x: position.x, y: position.y },
  }));
  return {
    vertices,
    edges: level.edges.map((e) => ({ a: e.a, b: e.b })),
    generationSeed: 0,
  };
}

/**
 * 序列化为格式化 JSON 字符串（便于粘贴进仓库）。
 */
export function serializeLevel(level: LevelDef): string {
  return `${JSON.stringify(level, null, 2)}\n`;
}

/**
 * 解析关卡 JSON；非法时返回 null。
 */
export function parseLevel(raw: string): LevelDef | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  return normalizeLevel(data);
}

/**
 * 校验并规范化未知 JSON 为 LevelDef。
 */
export function normalizeLevel(data: unknown): LevelDef | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const obj = data as Record<string, unknown>;
  if (obj.version !== LEVEL_FORMAT_VERSION) {
    return null;
  }
  if (typeof obj.id !== 'string' || obj.id.trim() === '') {
    return null;
  }
  if (typeof obj.title !== 'string') {
    return null;
  }
  const kind = obj.kind;
  if (kind !== 'mainline' && kind !== 'skin_demo' && kind !== 'skin') {
    return null;
  }
  if (!Array.isArray(obj.positions) || !Array.isArray(obj.edges)) {
    return null;
  }

  const n = obj.positions.length;
  if (!Number.isInteger(n) || n < VERTEX_COUNT_MIN || n > VERTEX_COUNT_HARD_CAP) {
    return null;
  }

  const positions: Vec2[] = [];
  for (const p of obj.positions) {
    if (!p || typeof p !== 'object') {
      return null;
    }
    const point = p as Record<string, unknown>;
    if (typeof point.x !== 'number' || typeof point.y !== 'number') {
      return null;
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }
    positions.push({ x: point.x, y: point.y });
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const e of obj.edges) {
    if (!e || typeof e !== 'object') {
      return null;
    }
    const edge = e as Record<string, unknown>;
    if (typeof edge.a !== 'number' || typeof edge.b !== 'number') {
      return null;
    }
    const a = Math.trunc(edge.a);
    const b = Math.trunc(edge.b);
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) {
      return null;
    }
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}-${hi}`;
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    edges.push({ a: lo, b: hi });
  }

  if (edges.length < n - 1) {
    // 至少应能连通；过稀通常是坏数据
    return null;
  }

  return {
    version: LEVEL_FORMAT_VERSION,
    id: obj.id.trim(),
    title: obj.title.trim() || obj.id.trim(),
    kind,
    positions,
    edges,
  };
}

/**
 * 深拷贝关卡（重开时恢复初始坐标）。
 */
export function cloneLevel(level: LevelDef): LevelDef {
  return {
    version: level.version,
    id: level.id,
    title: level.title,
    kind: level.kind,
    positions: level.positions.map((p) => ({ x: p.x, y: p.y })),
    edges: level.edges.map((e) => ({ a: e.a, b: e.b })),
  };
}
