import { defineConfig } from 'vite';

/**
 * Vite 构建配置：产出可静态托管的包，便于试玩链与日后 Toy 上传。
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
