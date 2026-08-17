import { GameApp } from './game/GameApp';
import { applyThemeToDocument } from './view/theme';

/**
 * 页面入口：注入定妆主题并挂载解缠应用。
 */
function main(): void {
  applyThemeToDocument();
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) {
    throw new Error('缺少 #app 根节点');
  }
  const app = new GameApp(root);
  app.start();
}

main();
