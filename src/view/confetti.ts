/**
 * 轻量拉炮彩花：在全屏 canvas 上喷射粒子。
 */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
};

const COLORS = ['#ff6b6b', '#ffd93d', '#6bcBff', '#b8f2e6', '#ffa8e8', '#c3f584', '#ffffff'];

/**
 * 在宿主元素上挂载彩花层，返回控制句柄。
 */
export function createConfettiLayer(host: HTMLElement): {
  burst: () => void;
  clear: () => void;
  destroy: () => void;
  readonly element: HTMLElement;
} {
  const layer = document.createElement('div');
  layer.className = 'celebrate-layer';
  layer.hidden = true;
  layer.setAttribute('aria-hidden', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'celebrate-canvas';
  layer.appendChild(canvas);
  host.appendChild(layer);

  const ctx = canvas.getContext('2d');
  let particles: Particle[] = [];
  let raf = 0;
  let running = false;

  /**
   * 同步画布像素尺寸。
   */
  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = host.clientWidth;
    const h = host.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /**
   * 从底部两侧与中心发射一批粒子。
   */
  function spawnBurst(): void {
    resize();
    const w = host.clientWidth;
    const h = host.clientHeight;
    const origins = [
      { x: w * 0.15, y: h * 0.92 },
      { x: w * 0.5, y: h * 0.96 },
      { x: w * 0.85, y: h * 0.92 },
    ];
    for (const origin of origins) {
      for (let i = 0; i < 42; i += 1) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
        const speed = 8 + Math.random() * 14;
        particles.push({
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * speed * (0.6 + Math.random()),
          vy: Math.sin(angle) * speed,
          w: 4 + Math.random() * 5,
          h: 6 + Math.random() * 8,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.35,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          life: 1,
        });
      }
    }
  }

  /**
   * 动画帧：重力与淡出。
   */
  function tick(): void {
    if (!ctx) {
      running = false;
      return;
    }
    const w = host.clientWidth;
    const h = host.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const next: Particle[] = [];
    for (const p of particles) {
      p.vy += 0.28;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.008;
      if (p.life <= 0 || p.y > h + 40) {
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
      next.push(p);
    }
    particles = next;
    if (particles.length > 0) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  /**
   * 触发一次拉炮并显示层。
   */
  function burst(): void {
    layer.hidden = false;
    spawnBurst();
    if (!running) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  }

  /**
   * 清空粒子并隐藏层。
   */
  function clear(): void {
    particles = [];
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    running = false;
    if (ctx) {
      ctx.clearRect(0, 0, host.clientWidth, host.clientHeight);
    }
    layer.hidden = true;
  }

  /**
   * 卸载 DOM 与动画。
   */
  function destroy(): void {
    clear();
    layer.remove();
  }

  return { burst, clear, destroy, element: layer };
}
