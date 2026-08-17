/**
 * 轻量合成音效（无外部音频文件，适合静态 Toy 包）。
 */

const SFX_STORAGE_KEY = 'untangle.sfx.v1';

/**
 * 音效控制器：可静音，状态写入 localStorage。
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private enabled: boolean;

  /**
   * 从本地存储恢复开关；默认开启。
   */
  public constructor() {
    const saved = localStorage.getItem(SFX_STORAGE_KEY);
    this.enabled = saved !== '0';
  }

  /**
   * 当前是否播放音效。
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 设置音效开关并持久化。
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem(SFX_STORAGE_KEY, enabled ? '1' : '0');
  }

  /**
   * 拖点开始时的短触感音。
   */
  public playDragStart(): void {
    this.beep(520, 0.045, 0.05, 'triangle');
  }

  /**
   * 通关庆祝短琶音。
   */
  public playSolved(): void {
    this.beep(523.25, 0.08, 0.07, 'sine');
    window.setTimeout(() => this.beep(659.25, 0.09, 0.07, 'sine'), 70);
    window.setTimeout(() => this.beep(783.99, 0.14, 0.08, 'sine'), 150);
  }

  /**
   * 懒创建 AudioContext（需用户手势后才能响）。
   */
  private ensureContext(): AudioContext | null {
    if (!this.enabled) {
      return null;
    }
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        return null;
      }
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * 播放单音。
   */
  private beep(
    freq: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
