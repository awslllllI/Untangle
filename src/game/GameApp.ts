import { Sfx } from '../audio/sfx';
import { CrossingTracker } from '../core/crossings';
import { clampVertexCount, createDeal } from '../core/generate';
import {
  cloneLevel,
  dealFromLevel,
  levelFromDeal,
  normalizeLevel,
  parseLevel,
  serializeLevel,
  type LevelDef,
} from '../core/level';
import { decodeSeed, encodeSeed } from '../core/seed';
import type { Deal } from '../core/types';
import {
  VERTEX_COUNT_HARD_CAP,
  VERTEX_COUNT_MIN,
  VERTEX_COUNT_PERF_HINT,
} from '../core/types';
import sampleDiamond from '../content/levels/sample-diamond.json';
import { Camera } from '../view/camera';
import { createConfettiLayer } from '../view/confetti';
import { attachInput } from '../view/input';
import { resetCameraToDeal } from '../view/renderer';
import { SvgGraphView } from '../view/svgGraph';

/** 长按重开：总时长（ms），侵蚀圆前快后慢直至铺满。 */
const RESTART_HOLD_MS = 1100;
/** 长按开始时立刻给出的侵蚀进度，便于感知生效。 */
const RESTART_VEIL_KICK = 0.12;
/** 首次玩法提示是否已关闭。 */
const TIPS_STORAGE_KEY = 'untangle.tips.v1';

/**
 * 组装可玩循环：生成、种子、SVG、菜单、包装（提示/音效/分享）、长按重开。
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
  private readonly loadSeedBtn: HTMLButtonElement;
  private readonly restartBtn: HTMLButtonElement;
  private readonly restartVeil: HTMLElement;
  private readonly tipsOverlay: HTMLElement;
  private readonly sfxToggle: HTMLInputElement;
  private readonly levelIdInput: HTMLInputElement;
  private readonly levelTitleInput: HTMLInputElement;
  private readonly levelJsonInput: HTMLTextAreaElement;
  private readonly loadLevelBtn: HTMLButtonElement;
  private readonly confetti: ReturnType<typeof createConfettiLayer>;
  private readonly sfx = new Sfx();

  private deal: Deal;
  /** 若当前来自手编关卡，重开时恢复该定义；否则按种子重生。 */
  private sourceLevel: LevelDef | null = null;
  private solved = false;
  private celebrationArmed = false;
  private activeVertexId: number | null = null;
  private needsDraw = true;
  private crossingsPending = false;
  private geometryPending = false;
  private running = false;
  private statusFlash: string | null = null;
  private menuOpen = false;
  private pendingLoadSeed = false;
  private pendingLoadLevel = false;
  private restartHolding = false;
  private restartProgress = 0;
  private restartRaf = 0;
  private restartStartedAt = 0;
  private restartOriginX = 0;
  private restartOriginY = 0;
  private restartMaxRadius = 1;
  private stepperRepeatTimer = 0;

  /**
   * 从页面根节点绑定 SVG、菜单与 HUD 控件。
   */
  public constructor(root: HTMLElement) {
    const surface = root.querySelector<SVGSVGElement>('#game');
    const statusEl = root.querySelector<HTMLElement>('#status');
    const vertexCountInput = root.querySelector<HTMLInputElement>('#vertex-count');
    const seedInput = root.querySelector<HTMLInputElement>('#seed-input');
    const rerollBtn = root.querySelector<HTMLButtonElement>('#reroll');
    const copySeedBtn = root.querySelector<HTMLButtonElement>('#copy-seed');
    const loadSeedBtn = root.querySelector<HTMLButtonElement>('#load-seed');
    const menuOverlay = root.querySelector<HTMLElement>('#menu-overlay');
    const menuOpenBtn = root.querySelector<HTMLButtonElement>('#menu-open');
    const menuHintEl = root.querySelector<HTMLElement>('#menu-hint');
    const menuPanel = root.querySelector<HTMLElement>('#menu-panel');
    const vertexDecBtn = root.querySelector<HTMLButtonElement>('#vertex-dec');
    const vertexIncBtn = root.querySelector<HTMLButtonElement>('#vertex-inc');
    const vertexStepper = root.querySelector<HTMLElement>('#vertex-stepper');
    const restartBtn = root.querySelector<HTMLButtonElement>('#restart-hold');
    const restartVeil = root.querySelector<HTMLElement>('#restart-veil');
    const tipsOverlay = root.querySelector<HTMLElement>('#tips-overlay');
    const tipsDismiss = root.querySelector<HTMLButtonElement>('#tips-dismiss');
    const tipsCard = root.querySelector<HTMLElement>('#tips-card');
    const showTipsBtn = root.querySelector<HTMLButtonElement>('#show-tips');
    const sfxToggle = root.querySelector<HTMLInputElement>('#sfx-toggle');
    const levelIdInput = root.querySelector<HTMLInputElement>('#level-id-input');
    const levelTitleInput = root.querySelector<HTMLInputElement>('#level-title-input');
    const levelJsonInput = root.querySelector<HTMLTextAreaElement>('#level-json-input');
    const exportLevelBtn = root.querySelector<HTMLButtonElement>('#export-level');
    const loadLevelBtn = root.querySelector<HTMLButtonElement>('#load-level');
    const loadSampleLevelBtn = root.querySelector<HTMLButtonElement>('#load-sample-level');

    if (
      !surface ||
      !statusEl ||
      !vertexCountInput ||
      !seedInput ||
      !rerollBtn ||
      !copySeedBtn ||
      !loadSeedBtn ||
      !menuOverlay ||
      !menuOpenBtn ||
      !menuHintEl ||
      !menuPanel ||
      !vertexDecBtn ||
      !vertexIncBtn ||
      !vertexStepper ||
      !restartBtn ||
      !restartVeil ||
      !tipsOverlay ||
      !tipsDismiss ||
      !tipsCard ||
      !showTipsBtn ||
      !sfxToggle ||
      !levelIdInput ||
      !levelTitleInput ||
      !levelJsonInput ||
      !exportLevelBtn ||
      !loadLevelBtn ||
      !loadSampleLevelBtn
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
    this.loadSeedBtn = loadSeedBtn;
    this.restartBtn = restartBtn;
    this.restartVeil = restartVeil;
    this.tipsOverlay = tipsOverlay;
    this.sfxToggle = sfxToggle;
    this.levelIdInput = levelIdInput;
    this.levelTitleInput = levelTitleInput;
    this.levelJsonInput = levelJsonInput;
    this.loadLevelBtn = loadLevelBtn;
    this.confetti = createConfettiLayer(root);

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

    this.sfxToggle.checked = this.sfx.isEnabled();
    this.sfxToggle.addEventListener('change', () => {
      this.sfx.setEnabled(this.sfxToggle.checked);
    });

    menuOpenBtn.addEventListener('click', () => this.openMenu());
    menuOverlay.addEventListener('click', () => this.closeMenu());
    menuPanel.addEventListener('click', (event) => event.stopPropagation());

    tipsDismiss.addEventListener('click', () => this.dismissTips(true));
    tipsOverlay.addEventListener('click', () => this.dismissTips(true));
    tipsCard.addEventListener('click', (event) => event.stopPropagation());
    showTipsBtn.addEventListener('click', () => {
      this.closeMenuWithoutApply();
      this.showTips();
    });

    rerollBtn.addEventListener('click', () => this.rerollAndReturn());
    loadSeedBtn.addEventListener('click', () => this.queueLoadSeed());
    copySeedBtn.addEventListener('click', () => {
      void this.copySeed();
    });
    exportLevelBtn.addEventListener('click', () => {
      void this.exportLevel();
    });
    loadLevelBtn.addEventListener('click', () => this.queueLoadLevel());
    loadSampleLevelBtn.addEventListener('click', () => this.loadSampleLevelAndReturn());
    levelJsonInput.addEventListener('input', () => this.refreshMenuHint());
    vertexCountInput.addEventListener('change', () => {
      this.normalizeVertexCountInput();
      this.refreshMenuHint();
    });
    vertexCountInput.addEventListener('input', () => this.refreshMenuHint());
    seedInput.addEventListener('input', () => this.refreshMenuHint());
    seedInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.queueLoadSeed();
      }
    });

    this.bindStepper(vertexDecBtn, -1);
    this.bindStepper(vertexIncBtn, 1);
    vertexStepper.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.nudgeVertexCount(event.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );

    this.bindRestartHold(restartBtn);
    this.confetti.element.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('#copy-result')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (this.celebrationArmed) {
        this.celebrationArmed = false;
        this.confetti.clear();
        this.reroll();
      }
    });
    this.confetti.copyResultBtn.addEventListener('click', () => {
      void this.copyResult();
    });

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(surface);
    }
  }

  /**
   * 启动尺寸同步、输入、首次提示与渲染循环。
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
        this.setSolvedState(this.crossings.isSolved());
        this.markDirty();
      },
      onActiveVertex: (vertexId) => {
        if (vertexId !== null && this.activeVertexId !== vertexId) {
          this.sfx.playDragStart();
        }
        this.activeVertexId = vertexId;
        this.graph.setActiveVertex(this.deal, vertexId);
        this.markDirty();
      },
    });
    this.updateStatus();
    if (localStorage.getItem(TIPS_STORAGE_KEY) !== '1') {
      this.showTips();
    }
    requestAnimationFrame(() => this.frame());
  }

  /**
   * 显示玩法提示层。
   */
  private showTips(): void {
    this.tipsOverlay.hidden = false;
  }

  /**
   * 关闭玩法提示；可选写入「已看过」。
   */
  private dismissTips(remember: boolean): void {
    this.tipsOverlay.hidden = true;
    if (remember) {
      localStorage.setItem(TIPS_STORAGE_KEY, '1');
    }
  }

  /**
   * 仅关菜单不应用草稿（用于从菜单再打开提示）。
   */
  private closeMenuWithoutApply(): void {
    if (!this.menuOpen) {
      return;
    }
    this.menuOpen = false;
    this.menuOverlay.hidden = true;
    this.root.classList.remove('menu-open');
    this.pendingLoadSeed = false;
    this.pendingLoadLevel = false;
    this.syncPendingButtons();
  }

  /**
   * 绑定顶点数加减：点击与按住连发。
   */
  private bindStepper(button: HTMLButtonElement, delta: number): void {
    const stop = (): void => {
      if (this.stepperRepeatTimer) {
        window.clearInterval(this.stepperRepeatTimer);
        this.stepperRepeatTimer = 0;
      }
    };

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      this.nudgeVertexCount(delta);
      stop();
      this.stepperRepeatTimer = window.setInterval(() => {
        this.nudgeVertexCount(delta);
      }, 90);
    });
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
  }

  /**
   * 步进顶点数并刷新菜单提示。
   */
  private nudgeVertexCount(delta: number): void {
    const current = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    const next = clampVertexCount(current + delta);
    this.vertexCountInput.value = String(next);
    this.refreshMenuHint();
  }

  /**
   * 校正输入框内的顶点数。
   */
  private normalizeVertexCountInput(): void {
    const n = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    this.vertexCountInput.value = String(n);
  }

  /**
   * 绑定长按重开：从按钮向外侵蚀铺满（先快后慢），完成后重启本局。
   */
  private bindRestartHold(button: HTMLButtonElement): void {
    const begin = (event: PointerEvent): void => {
      if (this.menuOpen || this.celebrationArmed || !this.tipsOverlay.hidden) {
        return;
      }
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      this.startRestartHold();
    };
    const end = (): void => {
      this.cancelRestartHold();
    };

    button.addEventListener('pointerdown', begin);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
  }

  /**
   * 记录从重开按钮中心铺满屏幕所需的最大半径。
   */
  private captureRestartOrigin(): void {
    const app = this.root.getBoundingClientRect();
    const btn = this.restartBtn.getBoundingClientRect();
    const x = btn.left + btn.width / 2 - app.left;
    const y = btn.top + btn.height / 2 - app.top;
    const w = app.width;
    const h = app.height;
    this.restartOriginX = x;
    this.restartOriginY = y;
    this.restartMaxRadius = Math.max(
      Math.hypot(x, y),
      Math.hypot(w - x, y),
      Math.hypot(x, h - y),
      Math.hypot(w - x, h - y),
      1,
    );
  }

  /**
   * 按进度更新从按钮中心向外侵蚀的黑色遮罩（边缘略软）。
   */
  private paintRestartVeil(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    this.restartProgress = p;
    if (p <= 0.001) {
      this.restartVeil.style.webkitMaskImage = 'none';
      this.restartVeil.style.maskImage = 'none';
      this.restartVeil.style.opacity = '0';
      return;
    }
    const r = p * this.restartMaxRadius;
    const feather = Math.min(56, Math.max(12, r * 0.28));
    const hard = Math.max(0, r - feather);
    const gradient = `radial-gradient(circle at ${this.restartOriginX}px ${this.restartOriginY}px, #000 0, #000 ${hard}px, transparent ${r}px)`;
    this.restartVeil.style.opacity = '1';
    this.restartVeil.style.webkitMaskImage = gradient;
    this.restartVeil.style.maskImage = gradient;
  }

  /**
   * 开始长按侵蚀进度。
   */
  private startRestartHold(): void {
    this.cancelRestartHold(false);
    this.captureRestartOrigin();
    this.restartHolding = true;
    this.restartStartedAt = performance.now();
    this.paintRestartVeil(RESTART_VEIL_KICK);

    const step = (now: number): void => {
      if (!this.restartHolding) {
        return;
      }
      const elapsed = now - this.restartStartedAt;
      const t = Math.min(1, elapsed / RESTART_HOLD_MS);
      const eased = 1 - (1 - t) ** 2.6;
      const progress = RESTART_VEIL_KICK + (1 - RESTART_VEIL_KICK) * eased;
      this.paintRestartVeil(progress);
      if (t >= 1) {
        this.restartHolding = false;
        this.restartRaf = 0;
        this.completeRestartHold();
        return;
      }
      this.restartRaf = requestAnimationFrame(step);
    };
    this.restartRaf = requestAnimationFrame(step);
  }

  /**
   * 取消长按：侵蚀圆快速缩回按钮。
   */
  private cancelRestartHold(animateOut = true): void {
    if (this.restartRaf) {
      cancelAnimationFrame(this.restartRaf);
      this.restartRaf = 0;
    }
    if (!this.restartHolding && this.restartProgress <= 0) {
      return;
    }
    this.restartHolding = false;
    if (!animateOut) {
      this.paintRestartVeil(0);
      return;
    }
    const from = this.restartProgress;
    const started = performance.now();
    const shrink = (now: number): void => {
      const u = Math.min(1, (now - started) / 200);
      const eased = u * u;
      this.paintRestartVeil(from * (1 - eased));
      if (u < 1) {
        this.restartRaf = requestAnimationFrame(shrink);
      } else {
        this.paintRestartVeil(0);
        this.restartRaf = 0;
      }
    };
    this.restartRaf = requestAnimationFrame(shrink);
  }

  /**
   * 侵蚀铺满后：同种子重建本局（点位回到圆上）。
   */
  private completeRestartHold(): void {
    this.paintRestartVeil(1);
    this.restartCurrentDeal();
    window.setTimeout(() => {
      this.paintRestartVeil(0);
    }, 140);
  }

  /**
   * 打开菜单：填入当前局草稿，暂不改游戏状态。
   */
  private openMenu(): void {
    if (this.celebrationArmed || !this.tipsOverlay.hidden) {
      return;
    }
    this.menuOpen = true;
    this.pendingLoadSeed = false;
    this.pendingLoadLevel = false;
    this.vertexCountInput.value = String(this.deal.vertices.length);
    this.syncSeedField();
    this.sfxToggle.checked = this.sfx.isEnabled();
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
    this.pendingLoadSeed = false;
    this.pendingLoadLevel = false;
    this.syncPendingButtons();
  }

  /**
   * 随机一局并立即返回游戏。
   */
  private rerollAndReturn(): void {
    this.pendingLoadSeed = false;
    this.pendingLoadLevel = false;
    this.normalizeVertexCountInput();
    this.menuOpen = false;
    this.menuOverlay.hidden = true;
    this.root.classList.remove('menu-open');
    this.syncPendingButtons();
    this.reroll();
  }

  /**
   * 在菜单里标记「加载种子」待生效（与加载关卡互斥）。
   */
  private queueLoadSeed(): void {
    this.pendingLoadSeed = !this.pendingLoadSeed;
    if (this.pendingLoadSeed) {
      this.pendingLoadLevel = false;
    }
    this.syncPendingButtons();
    this.refreshMenuHint();
  }

  /**
   * 在菜单里标记「加载关卡 JSON」待生效。
   */
  private queueLoadLevel(): void {
    this.pendingLoadLevel = !this.pendingLoadLevel;
    if (this.pendingLoadLevel) {
      this.pendingLoadSeed = false;
    }
    this.syncPendingButtons();
    this.refreshMenuHint();
  }

  /**
   * 同步待生效按钮高亮。
   */
  private syncPendingButtons(): void {
    this.loadSeedBtn.classList.toggle('pending', this.pendingLoadSeed);
    this.loadLevelBtn.classList.toggle('pending', this.pendingLoadLevel);
  }

  /**
   * 更新菜单提示文案。
   */
  private refreshMenuHint(): void {
    const n = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    const countChanged = n !== this.deal.vertices.length;
    const parts: string[] = [];
    if (this.pendingLoadLevel) {
      parts.push('将加载关卡 JSON');
    } else if (this.pendingLoadSeed) {
      parts.push('将加载种子');
    } else if (countChanged) {
      parts.push(`将生成 ${n} 点新局`);
    }
    this.menuHintEl.textContent =
      parts.length > 0
        ? `${parts.join('；')}（点空白处返回后生效）`
        : '点击菜单外空白处返回游戏';
  }

  /**
   * 退出菜单时应用草稿（不含随机一局 / 样例关，二者已即时返回）。
   */
  private applyMenuChanges(): void {
    if (this.pendingLoadLevel) {
      this.loadLevelFromInput();
      return;
    }

    const n = clampVertexCount(Number(this.vertexCountInput.value) || 8);
    this.vertexCountInput.value = String(n);
    const countChanged = n !== this.deal.vertices.length;

    if (this.pendingLoadSeed) {
      this.loadSeedFromInput();
    } else if (countChanged) {
      this.reroll();
    }
  }

  /**
   * 按当前顶点数重新生成一局，并刷新种子。
   */
  public reroll(): void {
    this.clearCelebration();
    this.sourceLevel = null;
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
   * 重开：关卡局恢复初始造型；种子局按种子重生圆布局。
   */
  private restartCurrentDeal(): void {
    this.clearCelebration();
    if (this.sourceLevel) {
      this.applyLevel(this.sourceLevel);
      this.flashStatus(`已重开「${this.sourceLevel.title}」`);
      return;
    }
    const n = this.deal.vertices.length;
    this.vertexCountInput.value = String(n);
    this.applyDeal(createDeal(n, this.deal.generationSeed));
    this.flashStatus('已重开本局');
  }

  /**
   * 从种子输入框加载并复现同一局。
   */
  public loadSeedFromInput(): void {
    this.clearCelebration();
    const payload = decodeSeed(this.seedInput.value);
    if (!payload) {
      this.flashStatus('种子无效，格式如 v1-8-a1b2c3d4');
      return;
    }

    const n = clampVertexCount(payload.vertexCount);
    if (n !== payload.vertexCount) {
      this.flashStatus(`顶点数已限制为 ${n}（上限 ${VERTEX_COUNT_HARD_CAP}）`);
    }

    this.sourceLevel = null;
    this.vertexCountInput.value = String(n);
    this.applyDeal(createDeal(n, payload.generationSeed));
    if (!this.statusFlash) {
      this.flashStatus('已按种子加载');
    }
  }

  /**
   * 从关卡 JSON 文本框加载手编关。
   */
  private loadLevelFromInput(): void {
    const level = parseLevel(this.levelJsonInput.value);
    if (!level) {
      this.flashStatus('关卡 JSON 无效');
      return;
    }
    this.applyLevel(level);
    this.flashStatus(`已加载「${level.title}」`);
  }

  /**
   * 立即加载样例关并关菜单。
   */
  private loadSampleLevelAndReturn(): void {
    const level = normalizeLevel(sampleDiamond);
    if (!level) {
      this.flashStatus('样例关损坏');
      return;
    }
    this.pendingLoadSeed = false;
    this.pendingLoadLevel = false;
    this.menuOpen = false;
    this.menuOverlay.hidden = true;
    this.root.classList.remove('menu-open');
    this.syncPendingButtons();
    this.levelJsonInput.value = serializeLevel(level).trim();
    this.levelIdInput.value = level.id;
    this.levelTitleInput.value = level.title;
    this.applyLevel(level);
    this.flashStatus(`样例关「${level.title}」`);
  }

  /**
   * 导出当前局为关卡 JSON 并复制。
   */
  public async exportLevel(): Promise<void> {
    const level = levelFromDeal(this.deal, {
      id: this.levelIdInput.value,
      title: this.levelTitleInput.value,
      kind: 'mainline',
    });
    const text = serializeLevel(level);
    this.levelJsonInput.value = text.trim();
    this.levelIdInput.value = level.id;
    this.levelTitleInput.value = level.title;
    try {
      await navigator.clipboard.writeText(text);
      this.flashStatus('关卡 JSON 已复制');
    } catch {
      this.levelJsonInput.select();
      this.flashStatus('无法写剪贴板，请手动复制 JSON 框');
    }
  }

  /**
   * 应用手编关卡（记下 source 供重开）。
   */
  private applyLevel(level: LevelDef): void {
    this.sourceLevel = cloneLevel(level);
    this.vertexCountInput.value = String(level.positions.length);
    this.applyDeal(dealFromLevel(level));
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
   * 复制通关结果战报文案。
   */
  public async copyResult(): Promise<void> {
    const seed = encodeSeed(this.deal.vertices.length, this.deal.generationSeed);
    const levelBit = this.sourceLevel ? ` · 关卡 ${this.sourceLevel.id}` : ` · 种子 ${seed}`;
    const text = `我解开了「解缠」！顶点 ${this.deal.vertices.length}${levelBit}`;
    try {
      await navigator.clipboard.writeText(text);
      this.flashStatus('结果已复制');
    } catch {
      this.flashStatus('无法写剪贴板，请长按手动复制');
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
    this.clearCelebration();
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
   * 更新通关态；刚通关时放彩花并等待再点开新局。
   */
  private setSolvedState(solved: boolean): void {
    const justSolved = solved && !this.solved;
    this.solved = solved;
    this.graph.setSolved(solved);
    this.updateStatus();
    if (justSolved) {
      this.celebrationArmed = true;
      this.sfx.playSolved();
      this.confetti.burst();
    }
  }

  /**
   * 清除通关庆祝层。
   */
  private clearCelebration(): void {
    this.celebrationArmed = false;
    this.confetti.clear();
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
      this.setSolvedState(this.crossings.isSolved());
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
      this.statusEl.textContent = '已解开！可复制结果，或点空白开新局';
      return;
    }
    if (this.sourceLevel) {
      this.statusEl.textContent = `关卡 ${this.sourceLevel.title} · 交叉 ${this.crossings.getCrossingCount()}`;
      return;
    }
    this.statusEl.textContent = `顶点 ${this.deal.vertices.length} · 边 ${this.deal.edges.length} · 交叉 ${this.crossings.getCrossingCount()}`;
  }
}
