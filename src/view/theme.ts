/**
 * 解缠定妆主题：画布渲染色 + UI CSS 变量同源。
 * v1 只落地一版皮肤；数据结构可换肤，不做多主题切换 UI。
 */

export type RenderTheme = {
  background: string;
  solvedBackground: string;
  edge: string;
  edgeCrossing: string;
  edgeLinked: string;
  edgeLinkedCrossing: string;
  vertex: string;
  vertexStroke: string;
  vertexActive: string;
  vertexLinked: string;
  vertexLinkedStroke: string;
};

/** 定妆配色（深色冷静调，交叉/选中对比加强）。 */
export const DEFAULT_THEME: RenderTheme = {
  background: '#0c121a',
  solvedBackground: '#123528',
  edge: '#9aabc4',
  edgeCrossing: '#ff5c4a',
  edgeLinked: '#3edcc8',
  edgeLinkedCrossing: '#ffc15a',
  vertex: '#eef3fa',
  vertexStroke: '#243040',
  vertexActive: '#5ecbff',
  vertexLinked: '#7af0e4',
  vertexLinkedStroke: '#1a6f68',
};

/**
 * 把定妆色写入文档 CSS 变量，菜单与 HUD 共用。
 */
export function applyThemeToDocument(theme: RenderTheme = DEFAULT_THEME): void {
  const root = document.documentElement;
  root.style.setProperty('--bg', '#080d14');
  root.style.setProperty('--surface', '#121a24');
  root.style.setProperty('--surface-2', '#1a2433');
  root.style.setProperty('--line', '#2e3c52');
  root.style.setProperty('--text', theme.vertex);
  root.style.setProperty('--muted', '#8fa3bb');
  root.style.setProperty('--accent', '#4a92f0');
  root.style.setProperty('--accent-soft', '#1a3d66');
  root.style.setProperty('--danger', theme.edgeCrossing);
  root.style.setProperty('--success', '#3ecf8e');
  root.style.setProperty('--game-bg', theme.background);
  root.style.setProperty('--solved-bg', theme.solvedBackground);
}
