import { VERTEX_COUNT_HARD_CAP, VERTEX_COUNT_MIN } from './types';

/** 当前种子格式版本（坐标进种子时再 bump）。 */
export const SEED_FORMAT_VERSION = 1;

/** 从种子解析出的一局生成参数。 */
export type SeedPayload = {
  version: number;
  vertexCount: number;
  generationSeed: number;
};

/**
 * 将顶点数限制在合法闭区间内（种子编解码用，避免依赖 generate）。
 */
function clampForSeed(vertexCount: number): number {
  const rounded = Math.round(vertexCount);
  return Math.min(VERTEX_COUNT_HARD_CAP, Math.max(VERTEX_COUNT_MIN, rounded));
}

/**
 * 将顶点数与生成种子编码为可分享字符串（不含顶点坐标）。
 * 格式：`v1-<顶点数>-<8位十六进制种子>`，例如 `v1-8-a1b2c3d4`。
 */
export function encodeSeed(vertexCount: number, generationSeed: number): string {
  const n = clampForSeed(vertexCount);
  const seed = (generationSeed >>> 0).toString(16).padStart(8, '0');
  return `v${SEED_FORMAT_VERSION}-${n}-${seed}`;
}

/**
 * 解析种子字符串；非法或版本不支持时返回 null。
 */
export function decodeSeed(raw: string): SeedPayload | null {
  const text = raw.trim().toLowerCase();
  const match = /^v(\d+)-(\d+)-([0-9a-f]{1,8})$/i.exec(text);
  if (!match) {
    return null;
  }

  const version = Number(match[1]);
  if (version !== SEED_FORMAT_VERSION) {
    return null;
  }

  const vertexCount = Number(match[2]);
  if (
    !Number.isInteger(vertexCount) ||
    vertexCount < VERTEX_COUNT_MIN ||
    vertexCount > VERTEX_COUNT_HARD_CAP
  ) {
    return null;
  }

  const generationSeed = Number.parseInt(match[3], 16);
  if (!Number.isFinite(generationSeed)) {
    return null;
  }

  return {
    version,
    vertexCount,
    generationSeed: generationSeed >>> 0,
  };
}

/**
 * 判断字符串是否为合法当前版本种子。
 */
export function isValidSeed(raw: string): boolean {
  return decodeSeed(raw) !== null;
}
