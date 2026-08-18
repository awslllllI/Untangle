/**
 * 生成 C1 关卡 JSON（自包含，不依赖 TS 路径解析）。
 * 运行：node scripts/with-node24.mjs node scripts/gen-c1-levels.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainlineDir = join(__dirname, '../src/content/levels/mainline');
const demoDir = join(__dirname, '../src/content/levels/skin');

/**
 * mulberry32。
 */
function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 随机下标。
 */
function randomIndex(rng, length) {
  return Math.floor(rng() * length);
}

/**
 * 洗牌。
 */
function shuffleInPlace(items, rng) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomIndex(rng, i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}

/**
 * 平面图边集（与 generate.ts 同逻辑）。
 */
function buildPlanarEdges(n, rng) {
  const edgeKeys = new Set();
  const faces = [];
  const add = (a, b) => {
    if (a === b) return;
    edgeKeys.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
  };
  add(0, 1);
  add(1, 2);
  add(2, 0);
  faces.push([0, 1, 2]);
  for (let v = 3; v < n; v += 1) {
    const fi = randomIndex(rng, faces.length);
    const [a, b, c] = faces[fi];
    faces.splice(fi, 1);
    add(v, a);
    add(v, b);
    add(v, c);
    faces.push([a, b, v], [b, c, v], [c, a, v]);
  }
  let edges = [...edgeKeys].map((key) => {
    const [a, b] = key.split('-').map(Number);
    return { a, b };
  });
  edges = thinEdges(edges, n, rng);
  return edges;
}

/**
 * 删边保连通与最低度。
 */
function thinEdges(edges, n, rng) {
  const working = [...edges];
  shuffleInPlace(working, rng);
  const minEdges = n;
  const target = Math.max(minEdges, Math.floor(n * (1.6 + rng() * 0.6)));
  const kept = [];
  const keptKeys = new Set();
  const degree = new Array(n).fill(0);
  const parent = Array.from({ length: n }, (_, i) => i);
  const edgeKey = (e) => `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
  const find = (x) => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[rb] = ra;
    return true;
  };
  const keepEdge = (e) => {
    const key = edgeKey(e);
    if (keptKeys.has(key)) return;
    keptKeys.add(key);
    kept.push(e);
    degree[e.a] += 1;
    degree[e.b] += 1;
  };
  for (const e of working) {
    if (union(e.a, e.b)) keepEdge(e);
  }
  for (const e of working) {
    if (keptKeys.has(edgeKey(e))) continue;
    if (degree[e.a] < 2 || degree[e.b] < 2) keepEdge(e);
  }
  for (const e of working) {
    if (degree.every((d) => d >= 2)) break;
    if (keptKeys.has(edgeKey(e))) continue;
    if (degree[e.a] < 2 || degree[e.b] < 2) keepEdge(e);
  }
  for (const e of working) {
    if (kept.length >= target) break;
    keepEdge(e);
  }
  return kept;
}

/**
 * 极坐标。
 */
function polar(r, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/**
 * 图形排布。
 */
function shapeLayout(n) {
  const pts = [];
  if (n === 6) {
    for (let i = 0; i < 6; i += 1) pts.push(polar(260, -90 + i * 60));
    return pts;
  }
  if (n === 7) {
    for (let i = 0; i < 6; i += 1) pts.push(polar(280, -90 + i * 60));
    pts.push({ x: 40, y: -20 });
    return pts;
  }
  if (n === 8) {
    pts.push({ x: 0, y: -300 }, { x: 300, y: 0 }, { x: 0, y: 300 }, { x: -300, y: 0 });
    pts.push({ x: 120, y: -80 }, { x: 80, y: 140 }, { x: -140, y: 60 }, { x: -60, y: -150 });
    return pts;
  }
  if (n === 9) {
    const rows = [1, 2, 3, 3];
    let id = 0;
    let y = -240;
    for (const count of rows) {
      if (id >= n) break;
      const span = (count - 1) * 110;
      for (let i = 0; i < count && id < n; i += 1) {
        pts.push({ x: -span / 2 + i * 110 + (count === 3 && y > 0 ? 30 : 0), y });
        id += 1;
      }
      y += 140;
    }
    while (pts.length < n) pts.push(polar(200, pts.length * 40));
    return pts.slice(0, n);
  }
  if (n === 10) {
    for (let i = 0; i < 5; i += 1) pts.push(polar(320, -90 + i * 72));
    for (let i = 0; i < 5; i += 1) pts.push(polar(140, -90 + 36 + i * 72));
    return pts;
  }
  if (n === 11) {
    pts.push({ x: -220, y: 180 }, { x: 220, y: 180 }, { x: 220, y: -40 }, { x: -220, y: -40 });
    pts.push({ x: 0, y: -260 });
    pts.push({ x: -80, y: 60 }, { x: 90, y: 40 }, { x: 20, y: -100 });
    pts.push({ x: -150, y: -120 }, { x: 160, y: -140 }, { x: 0, y: 100 });
    return pts;
  }
  if (n === 12) {
    for (let i = 0; i < 6; i += 1) pts.push(polar(300, -90 + i * 60));
    for (let i = 0; i < 6; i += 1) pts.push(polar(130, -60 + i * 60));
    return pts;
  }
  const outer = Math.ceil(n * 0.55);
  const inner = n - outer - (n >= 14 ? 1 : 0);
  for (let i = 0; i < outer; i += 1) {
    pts.push(polar(310, -90 + (360 * i) / outer + (i % 2) * 8));
  }
  for (let i = 0; i < inner; i += 1) {
    pts.push(polar(120 + (i % 3) * 25, 20 + (360 * i) / Math.max(1, inner)));
  }
  while (pts.length < n) pts.push({ x: (pts.length - n) * 35, y: 15 });
  return pts.slice(0, n);
}

/**
 * 皮肤演示布局。
 */
function demoLayout() {
  const pts = [];
  for (let i = 0; i < 5; i += 1) pts.push(polar(290, -90 + i * 72));
  pts.push({ x: 0, y: 0 });
  pts.push({ x: 100, y: -40 }, { x: -70, y: 90 });
  return pts;
}

const MAINLINE = [
  { index: 1, n: 6, title: '六角起步', seed: 0x6a1001 },
  { index: 2, n: 7, title: '心有一点', seed: 0x6a1002 },
  { index: 3, n: 8, title: '菱心纠缠', seed: 0x6a1003 },
  { index: 4, n: 9, title: '三角叠阵', seed: 0x6a1004 },
  { index: 5, n: 10, title: '星环初现', seed: 0x6a1005 },
  { index: 6, n: 11, title: '屋顶之下', seed: 0x6a1006 },
  { index: 7, n: 12, title: '双环相扣', seed: 0x6a1007 },
  { index: 8, n: 13, title: '外密内疏', seed: 0x6a1008 },
  { index: 9, n: 14, title: '十四结点', seed: 0x6a1009 },
  { index: 10, n: 15, title: '主线终章', seed: 0x6a100a },
];

/**
 * 写文件。
 */
function writeLevel(dir, level, fileName) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), `${JSON.stringify(level, null, 2)}\n`, 'utf8');
}

const catalogIds = [];
for (const row of MAINLINE) {
  const id = `main-${String(row.index).padStart(2, '0')}`;
  const rng = createRng(row.seed);
  const level = {
    version: 1,
    id,
    title: row.title,
    kind: 'mainline',
    positions: shapeLayout(row.n),
    edges: buildPlanarEdges(row.n, rng),
  };
  writeLevel(mainlineDir, level, `${id}.json`);
  catalogIds.push(id);
  console.log(`wrote ${id} n=${row.n} edges=${level.edges.length}`);
}

const demoRng = createRng(0x5d3e01);
const demo = {
  version: 1,
  id: 'skin-demo-01',
  title: '皮肤演示：涟漪',
  kind: 'skin_demo',
  positions: demoLayout(),
  edges: buildPlanarEdges(8, demoRng),
};
writeLevel(demoDir, demo, 'skin-demo-01.json');
console.log(`wrote ${demo.id} n=8 edges=${demo.edges.length}`);

writeFileSync(
  join(__dirname, '../src/content/levels/catalog.json'),
  `${JSON.stringify(
    {
      version: 1,
      mainline: catalogIds,
      unlockSkinDemoAfterMainlineIndex: 5,
      unlockFreeModeAfterMainlineIndex: 10,
      skinDemoId: 'skin-demo-01',
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log('wrote catalog.json');
