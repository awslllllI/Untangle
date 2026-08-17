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
 * 组装可玩循环：生成、种子、SVG、手机手势、齿轮菜单。
 */
export class GameApp {
  private readonly root: HTMLElement;
  private readonly surface: SVGSVGElement;
  private readonly camera = new Camera();
  private readonly crossings = new CrossingTracker();
  private readonly graph: SvgGraphView;
  private readonly statusEl: HTMLElement;
  private readonly vertexCountInput: HTMLInputElement;
  private readonly seedInput: HTMLInputElement;
  private readonly menuOverlay: HTMLElement;
  private readonly menuHintEl: HTMLElement;
  private readonly rerollBtn: HTMLButtonElement;
  private readonly resetViewBtn: HTMLButtonElement;
  private readonly loadSeedBtn: HTMLButtonElement;

  private deal: Deal;
  private solved = false;
  private activeVertexId: number | null = null;
  private needsDraw = true;
  private crossingsPending = false;
  private geometryPending = false;
  private running = false;
  private statusFlash: string | null = null;
  private menuOpen = false;
  private pendingReroll = false;
  private pendingLoadSeed = false;
  private pendingResetView = false;

  /**
   * 从页面根节点绑定 SVG 与菜单控件。
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
    const menuOverlay = root.querySelector<HTMLElement>('#menu-overlay');
    const menuOpenBtn = root.querySelector<HTMLButtonElement>('#menu-open');
    const menuDismissBtn = root.querySelector<HTMLButtonElement>('#menu-dismiss');
    const menuHintEl = root.querySelector<HTMLElement>('#menu-hint');
    const menuPanel = root.querySelector<HTMLElement>('#menu-panel');

    if (
      !surface ||
      !statusEl ||
      !vertexCountInput ||
      !seedInput ||
      !rerollBtn ||
      !resetViewBtn ||
      !copySeedBtn ||
      !loadSeedBtn ||
      !menuOverlay ||
      !menuOpenBtn ||
      !menuDismissBtn ||
      !menuHintEl ||
      !menuPanel
    ) {
      throw new Error('页面缺少必要的 #game / 菜单节点');
    }

    this.root = root;
    this.surface = surface;
    this.graph = new SvgGraphView(surface);
    this.statusEl = statusEl;
    this.vertexCountInput = vertexCountInput;
    this.seedInput = seedInput;
    this.menuOverlay = menuOverlay;
    this.menuHintEl = menuHintEl;
    this.rerollBtn = rerollBtn;
    this.resetViewBtn = resetViewBtn;
    this.loadSeedBtn = loadSeedBtn;

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

    menuOpenBtn.addEventListener('click', () => this.openMenu());
    menuDismissBtn.addEventListener('click', () => this.closeMenu());
    menuOverlay.addEventListener('click', () => this.closeMenu());
    menuPanel.addEventListener('click', (event) => event.stopPropagation());

    rerollBtn.addEventListener('click', () => this.queueMenuAction('reroll'));
    resetViewBtn.addEventListener('click', () => this.queueMenuAction('reset-view'));
    loadSeedBtn.addEventListener('click', () => this.queueMenuAction('load-seed'));
    copySeedBtn.addEventListener('click', () => {
      void this.copySeed();
    });
    vertexCountInput.addEventListener('input', () => this.refreshMenuHint());
    seedInput.addEventListener('input', () => this.refreshMenuHint());
    seedInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.queueMenuAction('load-seed');
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
        this.markDirty();
      },
      onVertexDrag: () => {
        this.crossingsPending = true;
        this.geometryPending = true;
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
      onActiveVertex: (vertexId) => {
        this.activeVertexId = vertexId;
        this.graph.setActiveVertex(this.deal, vertexId);
        this.markDirty();
      },
    });
    this.updateStatus();
    requestAnimationFrame(() => this.frame());
  }

  /**
   * 打开菜单：填入当前局草稿，暂不改游戏状态。
   */
  private openMenu(): void {
    this.menuOpen = true;
    this.pendingReroll = false;
    this.pendingLoadSeed = false;
    this.pendingResetView = false;
    this.vertexCountInput.value = String(this.deal.vertices.length);
    this.syncSeedField();
    this.syncPendingButtons();
    this.refreshMenuHint();
    this.menuOverlay.hidden = false;
    this.root.classList.add('menu-open');
  }

  /**
   * 关闭菜单并应用草稿中的修改。
   */
  private closeMenu(): void {
    if (!this.menuOpen) {
      return;
    }
    this.menuOpen = false;
    this.menuOverlay.hidden = true;
    this.root.classList.remove('menu-open');
    this.applyMenuChanges();
    this.pendingReroll = false;
    this.pendingLoadSeed = false;
    this.pendingResetView = false;
    this.syncPendingButtons();
  }

  /**
   * 在菜单里标记待生效动作（随机与加载互斥；重置视图可并存）。
   */
  private queueMenuAction(action: 'reroll' | 'load-seed' | 'reset-view'): void {
    if (action === 'reroll') {
      this.pendingReroll = !this.pendingReroll;
      if (this.pendingReroll) {
        this.pendingLoadSeed = false;
      }
    } else if (action === 'load-seed') {
      this.pendingLoadSeed = !this.pendingLoadSeed;
      if (this.pendingLoadSeed) {
        this.pendingReroll = false;
      }
    } else {
      this.pendingResetView = !this.pendingResetView;
    }
    this.syncPendingButtons();
    this.refreshMenuHint();
  }

  /**
   * 同步待生效按钮高亮。
   */
  private syncPendingButtons(): void {
    this.rerollBtn.classList.toggle('pending', this.pendingReroll);
    this.loadSeedBtn.classList.toggle('pending', this.pendingLoadSeed);
    this.resetViewBtn.classList.toggle('pending', this.pendingResetView);
  }

  /**
   * 更新菜单提示文案。
   */
  private refreshMenuHint(): void {
    const n = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    const countChanged = n !== this.deal.vertices.length;
    const parts: string[] = [];
    if (this.pendingLoadSeed) {
      parts.push('将加载种子');
    } else if (this.pendingReroll || countChanged) {
      parts.push(countChanged ? `将生成 ${n} 点新局` : '将随机新局');
    }
    if (this.pendingResetView) {
      parts.push('将重置视图');
    }
    this.menuHintEl.textContent =
      parts.length > 0
        ? `${parts.join('；')}（返回游戏后生效）`
        : '修改将在返回游戏后生效';
  }

  /**
   * 退出菜单时应用草稿：加载种子 / 随机 / 顶点数变更 / 重置视图。
   */
  private applyMenuChanges(): void {
    const n = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    this.vertexCountInput.value = String(n);
    const countChanged = n !== this.deal.vertices.length;
    let dealChanged = false;

    if (this.pendingLoadSeed) {
      this.loadSeedFromInput();
      dealChanged = true;
    } else if (this.pendingReroll || countChanged) {
      this.reroll();
      dealChanged = true;
    }

    // 新局本身会重置视图；仅在未换局时单独执行重置
    if (this.pendingResetView && !dealChanged) {
      this.resetView();
    }
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
   * 复制当前种子到剪贴板（立即生效，不改局）。
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
   * 同步视口尺寸到相机。
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
   * 每帧：合并判交与几何更新；平移/缩放只改 transform。
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
   * 根据交叉数与通关态刷新状态文案。
   */
  private updateStatus(): void {
    if (this.statusFlash) {
      this.statusEl.textContent = this.statusFlash;
      return;
    }
    if (this.solved) {
      this.statusEl.textContent = '已解开！可打开菜单继续';
      return;
    }
    this.statusEl.textContent = `顶点 ${this.deal.vertices.length} · 边 ${this.deal.edges.length} · 交叉 ${this.crossings.getCrossingCount()}`;
  }
}
