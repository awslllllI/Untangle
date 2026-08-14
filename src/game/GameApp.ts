import { findCrossings, isSolved } from '../core/crossings';
import { clampVertexCount, createDeal } from '../core/generate';
import type { Deal } from '../core/types';
import { VERTEX_COUNT_A0_CAP, VERTEX_COUNT_MIN } from '../core/types';
import { Camera } from '../view/camera';
import { attachInput } from '../view/input';
import { renderDeal, resetCameraToDeal } from '../view/renderer';

/**
 * 组装 A0 可玩循环：生成、交互、通关、工具栏。
 */
export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera = new Camera();
  private readonly statusEl: HTMLElement;
  private readonly vertexCountInput: HTMLInputElement;

  private deal: Deal;
  private solved = false;
  private activeVertexId: number | null = null;
  private needsDraw = true;
  private running = false;

  /**
   * 从页面根节点绑定画布与工具栏控件。
   */
  public constructor(root: HTMLElement) {
    const canvas = root.querySelector<HTMLCanvasElement>('#game');
    const statusEl = root.querySelector<HTMLElement>('#status');
    const vertexCountInput = root.querySelector<HTMLInputElement>('#vertex-count');
    const rerollBtn = root.querySelector<HTMLButtonElement>('#reroll');
    const resetViewBtn = root.querySelector<HTMLButtonElement>('#reset-view');

    if (!canvas || !statusEl || !vertexCountInput || !rerollBtn || !resetViewBtn) {
      throw new Error('页面缺少必要的 #game / 工具栏节点');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建 2D 绘图上下文');
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.statusEl = statusEl;
    this.vertexCountInput = vertexCountInput;

    vertexCountInput.min = String(VERTEX_COUNT_MIN);
    vertexCountInput.max = String(VERTEX_COUNT_A0_CAP);

    const initialCount = clampVertexCount(Number(vertexCountInput.value) || 8);
    vertexCountInput.value = String(Math.min(VERTEX_COUNT_A0_CAP, initialCount));
    this.deal = createDeal(Number(vertexCountInput.value));

    rerollBtn.addEventListener('click', () => this.reroll());
    resetViewBtn.addEventListener('click', () => this.resetView());
    vertexCountInput.addEventListener('change', () => this.reroll());

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
    }
  }

  /**
   * 启动尺寸同步、输入与渲染循环。
   */
  public start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.resize();
    this.resetView();
    attachInput(this.canvas, this.camera, () => this.deal, {
      onChange: () => {
        this.checkSolved();
        this.markDirty();
      },
      onDragEnd: () => this.checkSolved(),
      onActiveVertex: (vertexId: number | null) => {
        this.activeVertexId = vertexId;
        this.markDirty();
      },
    });
    this.updateStatus();
    requestAnimationFrame(() => this.frame());
  }

  /**
   * 按当前顶点数重新生成一局。
   */
  public reroll(): void {
    let n = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    n = Math.min(VERTEX_COUNT_A0_CAP, n);
    this.vertexCountInput.value = String(n);
    this.deal = createDeal(n);
    this.solved = false;
    this.activeVertexId = null;
    this.resetView();
    this.updateStatus();
    this.markDirty();
  }

  /**
   * 重置相机使全部顶点入画。
   */
  public resetView(): void {
    resetCameraToDeal(this.camera, this.deal);
    this.markDirty();
  }

  /**
   * 同步 canvas 分辨率与相机视口（兼容 Windows 125%/150% 等缩放）。
   */
  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const bufferW = Math.max(1, Math.round(width * dpr));
    const bufferH = Math.max(1, Math.round(height * dpr));

    if (this.canvas.width !== bufferW) {
      this.canvas.width = bufferW;
    }
    if (this.canvas.height !== bufferH) {
      this.canvas.height = bufferH;
    }

    this.camera.setViewport(width, height, dpr);
    this.markDirty();
  }

  /**
   * 标记需要重绘。
   */
  private markDirty(): void {
    this.needsDraw = true;
  }

  /**
   * 渲染一帧；无变化时跳过绘制以省电。
   */
  private frame(): void {
    if (!this.running) {
      return;
    }
    if (this.needsDraw) {
      this.needsDraw = false;
      renderDeal(this.ctx, this.deal, this.camera, {
        activeVertexId: this.activeVertexId,
        solved: this.solved,
      });
    }
    requestAnimationFrame(() => this.frame());
  }

  /**
   * 通关检测并更新状态文案。
   */
  private checkSolved(): void {
    const nowSolved = isSolved(this.deal);
    if (nowSolved !== this.solved) {
      this.solved = nowSolved;
    }
    this.updateStatus();
    this.markDirty();
  }

  /**
   * 根据交叉数与通关态刷新工具栏状态。
   */
  private updateStatus(): void {
    if (this.solved) {
      this.statusEl.textContent = '已解开！可点「随机一局」继续';
      return;
    }
    const crossings = findCrossings(this.deal).length;
    this.statusEl.textContent = `顶点 ${this.deal.vertices.length} · 边 ${this.deal.edges.length} · 交叉 ${crossings}`;
  }

}
