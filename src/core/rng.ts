/**
 * 可复现的 32 位 mulberry32 随机数生成器。
 */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  /**
   * 返回 [0, 1) 均匀随机数。
   */
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 用当前时间熵生成一个无符号种子。
 */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * 从数组中均匀随机取一个下标。
 */
export function randomIndex(rng: () => number, length: number): number {
  return Math.floor(rng() * length);
}

/**
 * 原地洗牌（Fisher–Yates）。
 */
export function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomIndex(rng, i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}
