import { normalizeLevel, type LevelDef } from '../core/level';
import catalog from './levels/catalog.json';
import main01 from './levels/mainline/main-01.json';
import main02 from './levels/mainline/main-02.json';
import main03 from './levels/mainline/main-03.json';
import main04 from './levels/mainline/main-04.json';
import main05 from './levels/mainline/main-05.json';
import main06 from './levels/mainline/main-06.json';
import main07 from './levels/mainline/main-07.json';
import main08 from './levels/mainline/main-08.json';
import main09 from './levels/mainline/main-09.json';
import main10 from './levels/mainline/main-10.json';
import skinDemo01 from './levels/skin/skin-demo-01.json';

/** 战役目录（主线列表与解锁门槛）。 */
export type CampaignCatalog = {
  version: number;
  mainline: string[];
  unlockSkinDemoAfterMainlineIndex: number;
  unlockFreeModeAfterMainlineIndex: number;
  skinDemoId: string;
};

/** 仓库内嵌的战役目录。 */
export const CAMPAIGN_CATALOG = catalog as CampaignCatalog;

const LEVEL_BY_ID = new Map<string, LevelDef>();

/**
 * 将 JSON 关卡注册进内存索引。
 */
function registerLevel(raw: unknown): void {
  const level = normalizeLevel(raw);
  if (level) {
    LEVEL_BY_ID.set(level.id, level);
  }
}

registerLevel(main01);
registerLevel(main02);
registerLevel(main03);
registerLevel(main04);
registerLevel(main05);
registerLevel(main06);
registerLevel(main07);
registerLevel(main08);
registerLevel(main09);
registerLevel(main10);
registerLevel(skinDemo01);

/**
 * 按 id 取关卡定义；不存在时返回 null。
 */
export function getLevelById(id: string): LevelDef | null {
  return LEVEL_BY_ID.get(id) ?? null;
}

/**
 * 主线关卡总数。
 */
export function getMainlineCount(): number {
  return CAMPAIGN_CATALOG.mainline.length;
}

/**
 * 取主线第 index 关（1-based）；越界或缺失时返回 null。
 */
export function getMainlineLevel(index: number): LevelDef | null {
  const id = CAMPAIGN_CATALOG.mainline[index - 1];
  if (!id) {
    return null;
  }
  return getLevelById(id);
}

/**
 * 取主线第 index 关的展示信息（1-based）。
 */
export function getMainlineMeta(
  index: number,
): { id: string; title: string } | null {
  const level = getMainlineLevel(index);
  if (!level) {
    return null;
  }
  return { id: level.id, title: level.title };
}

/**
 * 取皮肤演示关卡。
 */
export function getSkinDemoLevel(): LevelDef | null {
  return getLevelById(CAMPAIGN_CATALOG.skinDemoId);
}
