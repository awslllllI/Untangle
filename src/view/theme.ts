/**
 * 解缠渲染主题色（与具体绘制逻辑分离，供缓存层复用）。
 */

export type RenderTheme = {
  background: string;
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

/** 默认配色（包装阶段可换主题）。 */
export const DEFAULT_THEME: RenderTheme = {
  background: '#0f1419',
  edge: '#8b9bb4',
  edgeCrossing: '#e85d4c',
  edgeLinked: '#3dd6c6',
  edgeLinkedCrossing: '#ffb454',
  vertex: '#e8eef7',
  vertexStroke: '#2a3340',
  vertexActive: '#5ec8ff',
  vertexLinked: '#7aefe3',
  vertexLinkedStroke: '#1a6b64',
};
