import { boundsOfVertices } from '../core/crossings';
import type { Deal } from '../core/types';
import type { Camera } from './camera';

export type { RenderTheme } from './theme';
export { DEFAULT_THEME } from './theme';

/**
 * 根据顶点包围盒重置相机视野。
 */
export function resetCameraToDeal(camera: Camera, deal: Deal): void {
  const positions = deal.vertices.map((v) => v.position);
  const b = boundsOfVertices(positions);
  camera.fitBounds(b.minX, b.minY, b.maxX, b.maxY);
}
