# 关卡内容

## 目录

- `mainline/` — C1 主线 10 关（点数 6→15，大约每关 +1）
- `skin/` — 皮肤演示关（无 IP）
- `catalog.json` — 主线顺序与解锁门编号
- `sample-diamond.json` — C0 导出格式样例

## 制作 / 重生

1. 游戏内摆造型 → 菜单「导出关卡」
2. 或运行：`node scripts/with-node24.mjs node scripts/gen-c1-levels.mjs`

`kind`：`mainline` | `skin_demo` | `skin`

## 解锁约定（C1）

- 通关主线第 **5** 关后：可进 `skin-demo-01`
- 通关主线第 **10** 关后：解锁自由模式
