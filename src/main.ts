import { GameApp } from './game/GameApp';

/**
 * 页面入口：挂载解缠应用。
 */
function main(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) {
    throw new Error('缺少 #app 根节点');
  }
  const app = new GameApp(root);
  app.start();
}

main();
