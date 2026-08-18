/** 战役进度在 localStorage 中的键名。 */
const PROGRESS_STORAGE_KEY = 'untangle.progress.v1';

/** 本地战役进度：主线已通关数与皮肤演示是否通关。 */
export type CampaignProgress = {
  /** 已通关的主线关序号（1-based），0 表示尚未通关任何关。 */
  mainlineCleared: number;
  /** 皮肤演示关是否已通关。 */
  skinDemoCleared: boolean;
};

/**
 * 读取本地战役进度；损坏或缺失时返回初始进度。
 */
export function loadProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) {
      return defaultProgress();
    }
    const data = JSON.parse(raw) as Partial<CampaignProgress>;
    const mainlineCleared =
      typeof data.mainlineCleared === 'number' && Number.isFinite(data.mainlineCleared)
        ? Math.max(0, Math.floor(data.mainlineCleared))
        : 0;
    return {
      mainlineCleared,
      skinDemoCleared: data.skinDemoCleared === true,
    };
  } catch {
    return defaultProgress();
  }
}

/**
 * 将战役进度写入 localStorage。
 */
export function saveProgress(progress: CampaignProgress): void {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

/**
 * 主线第 index 关（1-based）是否可玩：须按顺序解锁。
 */
export function canPlayMainlineIndex(progress: CampaignProgress, index: number): boolean {
  if (index < 1) {
    return false;
  }
  return index <= progress.mainlineCleared + 1;
}

/**
 * 皮肤演示是否已解锁（通关主线第 unlockAfterIndex 关后）。
 */
export function isSkinDemoUnlocked(
  progress: CampaignProgress,
  unlockAfterIndex: number,
): boolean {
  return progress.mainlineCleared >= unlockAfterIndex;
}

/**
 * 自由模式是否已解锁（通关主线第 unlockAfterIndex 关后）。
 */
export function isFreeModeUnlocked(
  progress: CampaignProgress,
  unlockAfterIndex: number,
): boolean {
  return progress.mainlineCleared >= unlockAfterIndex;
}

/**
 * 记录主线某一关通关；仅当 index 大于当前进度时推进。
 */
export function recordMainlineClear(
  progress: CampaignProgress,
  index: number,
): CampaignProgress {
  if (index <= progress.mainlineCleared) {
    return progress;
  }
  return { ...progress, mainlineCleared: index };
}

/**
 * 记录皮肤演示关通关。
 */
export function recordSkinDemoClear(progress: CampaignProgress): CampaignProgress {
  if (progress.skinDemoCleared) {
    return progress;
  }
  return { ...progress, skinDemoCleared: true };
}

/**
 * 返回空进度（新玩家）。
 */
function defaultProgress(): CampaignProgress {
  return { mainlineCleared: 0, skinDemoCleared: false };
}
