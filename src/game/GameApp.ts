import { CrossingTracker } from '../core/crossings';
import { clampVertexCount, createDeal } from '../core/generate';
import { decodeSeed, encodeSeed } from '../core/seed';
import type { Deal } from '../core/types';
import {
  VERTEX_COUNT_HARD_CAP,
  VERTEX_COUNT_MIN,
  VERTEX_COUNT_PERF_HINT,
} from '../core/types';
import { Camera } from '../view/camera';
import { attachInput } from '../view/input';
import { resetCameraToDeal } from '../view/renderer';
import { SvgGraphView } from '../view/svgGraph';

/**
 * 组装可玩循环：生成、种子复现、SVG 矢量渲染、交互、通关、工具栏。
 */
export class GameApp {
  private readonly surface: SVGSVGElement;
  private readonly camera = new Camera();
  private readonly crossings = new CrossingTracker();
  private readonly graph: SvgGraphView;
  private readonly statusEl: HTMLElement;
  private readonly vertexCountInput: HTMLInputElement;
  private readonly seedInput: HTMLInputElement;

  private deal: Deal;
  private solved = false;
  private activeVertexId: number | null = null;
  private needsDraw = true;
  private crossingsPending = false;
  private geometryPending = false;
  private running = false;
  private statusFlash: string | null = null;

  /**
   * 从页面根节点绑定 SVG 与工具栏控件。
   */
  public constructor(root: HTMLElement) {
    const surface = root.querySelector<SVGSVGElement>('#game');
    const statusEl = root.querySelector<HTMLElement>('#status');
    const vertexCountInput = root.querySelector<HTMLInputElement>('#vertex-count');
    const seedInput = root.querySelector<HTMLInputElement>('#seed-input');
    const rerollBtn = root.querySelector<HTMLButtonElement>('#reroll');
    const resetViewBtn = root.querySelector<HTMLButtonElement>('#reset-view');
    const copySeedBtn = root.querySelector<HTMLButtonElement>('#copy-seed');
    const loadSeedBtn = root.querySelector<HTMLButtonElement>('#load-seed');

    if (
      !surface ||
      !statusEl ||
      !vertexCountInput ||
      !seedInput ||
      !rerollBtn ||
      !resetViewBtn ||
      !copySeedBtn ||
      !loadSeedBtn
    ) {
      throw new Error('页面缺少必要的 #game / 工具栏节点');
    }

    this.surface = surface;
    this.graph = new SvgGraphView(surface);
    this.statusEl = statusEl;
    this.vertexCountInput = vertexCountInput;
    this.seedInput = seedInput;

    vertexCountInput.min = String(VERTEX_COUNT_MIN);
    vertexCountInput.max = String(VERTEX_COUNT_HARD_CAP);

    const initialCount = clampVertexCount(Number(vertexCountInput.value) || 8);
    vertexCountInput.value = String(initialCount);
    this.deal = createDeal(initialCount);
    this.crossings.rebuild(this.deal);
    this.graph.rebuild(this.deal);
    this.graph.syncCrossings(this.crossings.getHotEdges());
    this.solved = this.crossings.isSolved();
    this.syncSeedField();

    rerollBtn.addEventListener('click', () => this.reroll());
    resetViewBtn.addEventListener('click', () => this.resetView());
    vertexCountInput.addEventListener('change', () => this.reroll());
    copySeedBtn.addEventListener('click', () => {
      void this.copySeed();
    });
    loadSeedBtn.addEventListener('click', () => this.loadSeedFromInput());
    seedInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.loadSeedFromInput();
      }
    });

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(surface);
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
    attachInput(this.surface, this.camera, () => this.deal, {
      onChange: () => {
        if (this.activeVertexId !== null) {
          this.crossingsPending = true;
          this.geometryPending = true;
        }
        this.markDirty();
      },
      onDragEnd: () => {
        if (this.activeVertexId !== null) {
          this.crossings.updateAfterVertexMove(this.deal, this.activeVertexId);
          this.graph.syncVertexDrag(this.deal, this.activeVertexId);
          this.crossingsPending = false;
          this.geometryPending = false;
        }
        this.crossings.refreshSpatialIndex(this.deal);
        this.graph.syncCrossings(this.crossings.getHotEdges());
        this.solved = this.crossings.isSolved();
        this.graph.setSolved(this.solved);
        this.updateStatus();
        this.markDirty();
      },
      onActiveVertex: (vertexId: number | null) => {
        this.activeVertexId = vertexId;
        this.graph.setActiveVertex(this.deal, vertexId);
        this.markDirty();
      },
    });
    this.updateStatus();
    requestAnimationFrame(() => this.frame());
  }

  /**
   * 按当前顶点数重新生成一局，并刷新种子。
   */
  public reroll(): void {
    const n = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    this.vertexCountInput.value = String(n);
    if (n >= VERTEX_COUNT_PERF_HINT) {
      this.flashStatus(`生成 ${n} 点局中…大图请用缩放点选`);
      window.setTimeout(() => {
        this.applyDeal(createDeal(n));
      }, 0);
      return;
    }
    this.applyDeal(createDeal(n));
  }

  /**
   * 从种子输入框加载并复现同一局。
   */
  public loadSeedFromInput(): void {
    const payload = decodeSeed(this.seedInput.value);
    if (!payload) {
      this.flashStatus('种子无效，格式如 v1-8-a1b2c3d4');
      return;
    }

    const n = clampVertexCount(payload.vertexCount);
    if (n !== payload.vertexCount) {
      this.flashStatus(`顶点数已限制为 ${n}（上限 ${VERTEX_COUNT_HARD_CAP}）`);
    }

    this.vertexCountInput.value = String(n);
    this.applyDeal(createDeal(n, payload.generationSeed));
    if (!this.statusFlash) {
      this.flashStatus('已按种子加载');
    }
  }

  /**
   * 复制当前种子到剪贴板。
   */
  public async copySeed(): Promise<void> {
    const text = encodeSeed(this.deal.vertices.length, this.deal.generationSeed);
    this.seedInput.value = text;
    try {
      await navigator.clipboard.writeText(text);
      this.flashStatus('种子已复制');
    } catch {
      this.seedInput.select();
      this.flashStatus('无法写剪贴板，请手动复制种子框');
    }
  }

  /**
   * 重置相机使全部顶点入画。
   */
  public resetView(): void {
    resetCameraToDeal(this.camera, this.deal);
    this.markDirty();
  }

  /**
   * 应用新局并重置通关/视图/种子展示。
   */
  private applyDeal(deal: Deal): void {
    this.deal = deal;
    this.crossings.rebuild(deal);
    this.crossingsPending = false;
    this.geometryPending = false;
    this.graph.rebuild(deal);
    this.graph.syncCrossings(this.crossings.getHotEdges());
    this.solved = this.crossings.isSolved();
    this.graph.setSolved(this.solved);
    this.activeVertexId = null;
    this.graph.setActiveVertex(deal, null);
    this.syncSeedField();
    this.resetView();
    this.updateStatus();
    this.markDirty();
  }

  /**
   * 把当前局的种子同步到输入框。
   */
  private syncSeedField(): void {
    this.seedInput.value = encodeSeed(
      this.deal.vertices.length,
      this.deal.generationSeed,
    );
  }

  /**
   * 短暂覆盖状态栏文案。
   */
  private flashStatus(message: string): void {
    this.statusFlash = message;
    this.updateStatus();
    window.setTimeout(() => {
      if (this.statusFlash === message) {
        this.statusFlash = null;
        this.updateStatus();
      }
    }, 1800);
  }

  /**
   * 同步视口尺寸到相机（SVG 用 CSS 像素即可）。
   */
  private resize(): void {
    const width = Math.max(1, this.surface.clientWidth);
    const height = Math.max(1, this.surface.clientHeight);
    this.camera.setViewport(width, height, window.devicePixelRatio || 1);
    this.markDirty();
  }

  /**
   * 标记需要刷新视图。
   */
  private markDirty(): void {
    this.needsDraw = true;
  }

  /**
   * 每帧：合并判交与 DOM 几何更新；平移/缩放只改 transform。
   */
  private frame(): void {
    if (!this.running) {
      return;
    }

    if (this.geometryPending && this.activeVertexId !== null) {
      this.geometryPending = false;
      this.graph.syncVertexDrag(this.deal, this.activeVertexId);
    }

    if (this.crossingsPending && this.activeVertexId !== null) {
      this.crossingsPending = false;
      this.crossings.updateAfterVertexMove(this.deal, this.activeVertexId);
      this.graph.syncCrossings(this.crossings.getHotEdges());
      this.solved = this.crossings.isSolved();
      this.graph.setSolved(this.solved);
      this.updateStatus();
    }

    if (this.needsDraw) {
      this.needsDraw = false;
      this.graph.syncCamera(this.camera);
    }

    requestAnimationFrame(() => this.frame());
  }

  /**
   * 根据交叉数与通关态刷新工具栏状态。
   */
  private updateStatus(): void {
    if (this.statusFlash) {
      this.statusEl.textContent = this.statusFlash;
      return;
    }
    if (this.solved) {
      this.statusEl.textContent = '已解开！可点「随机一局」继续';
      return;
    }
    this.statusEl.textContent = `顶点 ${this.deal.vertices.length} · 边 ${this.deal.edges.length} · 交叉 ${this.crossings.getCrossingCount()}`;
  }
}
