# UI 轻量视觉刷新设计

- 日期：2026-09-11
- 状态：已确认（用户逐项选定）
- 范围：v1.1.0 UI 打磨——视觉精致度 + 克制微动效，覆盖主窗口 / 快速面板（quick）/ 桌面小组件（widget）三个窗口

## 1. 目标与决策记录

| 决策点 | 结论 |
|---|---|
| 打磨目标 | 视觉精致度 + 交互与动效 |
| 视觉幅度 | 轻量刷新：布局与组件形态不动，观感焕新 |
| 动效尺度 | 克制微动效：总时长 120~180ms，不引人注意但手感变好 |
| 实施方式 | 原地精修单文件 index.css，不拆文件、不抽组件 |
| 主色调 | 青碧 Teal / 靛蓝 Indigo / 珊瑚 Coral / 黛青 Slate-Teal 四色全保留，做成设置页可切换主题色选项 |
| 默认主题色 | 青碧 Teal（新装与升级用户均默认） |

## 2. 背景：现状与发现的问题

- 单一全局 `src/index.css`（403 行），BEM 风格 class，无组件库。
- 设计 token 仅 9 个颜色变量（`--bg/--panel/--text/--muted/--border/--accent/--danger/--ok/--warn`），浅深两套；无间距/圆角/阴影/动效 token。
- 圆角混用 4/6/8/10/12/14px；阴影 4 处硬编码 rgba；部分颜色硬编码（`.tdot.p0-p3`、`TaskCard.tsx` 的 `PRIORITY_COLORS`、品牌渐变字）。
- 无任何过渡动画；无键盘焦点样式。
- **缺陷**：`.month-grid` 定义两次且属性冲突（122 行实线网格版 vs 220 行间隙版，后者覆盖 gap）；`.settings-row small` 重复两次。
- **缺陷**：quick/widget 窗口未调用 `applyTheme`，不跟随深浅色主题。
- `index.html` 标题仍是脚手架默认 "Tauri + React + Typescript"。

## 3. 设计 Token（index.css 顶部）

### 3.1 主题色包（4 套 × 浅深两态）

每套 accent 定义 5 个变量：

- `--accent`：主色
- `--accent-hover`：hover / primary 按钮深一档
- `--accent-soft`：淡背景（focus ring、选中底色）
- `--accent-contrast`：主色按钮上的文字色
- `--brand-grad`：品牌字渐变双色

通过 `html` 元素 class 组合：`dark` × `accent-teal`（默认）/ `accent-indigo` / `accent-coral` / `accent-slate`。写法为 `.accent-teal { ... }`、`.dark.accent-teal { ... }` 等 8 组块。

色值（实现时以色板确认页为准微调对比度）：

| 主题色 | 浅色 accent | 深色 accent |
|---|---|---|
| teal（默认） | `#0d9488` | `#2dd4bf` |
| indigo | `#4f46e5` | `#818cf8` |
| coral | `#e85d3d` | `#fb8a6a` |
| slate | `#35707e` | `#6fb3c2` |

### 3.2 中性色与统一档位

- 深色模式拉开 bg / panel / 悬浮层三个层次（实现时微调 `--bg`/`--panel`，弹层可用 `--panel` 提亮一档）。
- 新增 `--border-strong`（弹层边框，比 `--border` 深一档）、`--shadow-color`。
- 圆角三档：`--radius-sm: 6px`（dot、小角标）/ `--radius-md: 8px`（按钮、输入框、卡片）/ `--radius-lg: 12px`（弹层、dialog、widget）。现有 4~14px 全部归档到最近档位。
- 阴影两档：`--shadow-1`（卡片 hover）/ `--shadow-2`（弹层），引用 `--shadow-color`。
- 动效：`--dur-fast: 120ms`、`--dur: 180ms`、`--ease: cubic-bezier(.2, .8, .3, 1)`。
- 间距与字号不做全量 token 化（现状已基本统一，YAGNI）。

## 4. 视觉精修清单（原地改选择器）

1. **前置修复**：`.month-grid` 两处定义拆为两个类——CalendarPage 用实线网格版（改名或保留原名），DatePicker 弹层用间隙版（新类名）；`.settings-row small` 重复合并。
2. 按钮：加 `transition`；hover 背景微变；`:active` 按压（`transform: translateY(1px)` 或亮度变化）；`.btn.primary` hover 用 `--accent-hover`。
3. 输入框 focus：accent 边框 + `box-shadow: 0 0 0 3px var(--accent-soft)` ring。
4. 卡片 hover（overview-card / link-card / task-card）：`translateY(-1px)` + `--shadow-1`；task-card 不加位移（避免拖拽时视觉抖动），仅加 `--shadow-1`。
5. 硬编码色收编：`.tdot.p0-p3` 与 `TaskCard.tsx` 的 `PRIORITY_COLORS` 对齐（同一组四色值，CSS 侧加注释指向 token 区）；品牌渐变字 `.brand-name` 改用 `var(--brand-grad)`，随主题色变化。
6. 键盘焦点可见性：`:focus-visible` 统一 outline（accent 色 2px）。
7. 滚动条细化：webkit 滚动条窄条 + 主题色 thumb（Windows 桌面观感收益明显）。

## 5. 克制微动效

- 全局交互过渡基线 120~180ms（background / border / color / box-shadow / transform）：按钮、侧栏项、列表项、输入框、链接卡片。
- 弹层出场动画：fadeIn + `scale(0.98 → 1)`，`var(--dur)` 时长——picker-pop / spinner-pop / timer-pomo / dialog / drawer / link-candidates。
- **只做出场，不做退场**（退场需 JS 延迟卸载，超出本次范围）。
- 页面切换淡入：`App.tsx` 的 `.content` 内层加 `key={activePage}` + CSS `fadeIn` 动画（`--dur`）。
- 可访问性：`@media (prefers-reduced-motion: reduce)` 下关闭全部 transition/animation。

## 6. 主题色切换功能

### 6.1 前端

- `src/lib/theme.ts`：
  - 新增类型 `AccentTheme = 'teal' | 'indigo' | 'coral' | 'slate'`。
  - `applyTheme(mode, accent)`：维护 `dark` 与 `accent-*` 两个 class；默认 `teal`。
  - 新增 `useThemeSync()` hook：启动时读 settings 应用主题；`listen('theme://changed')` 跟随变化；system 模式监听 `matchMedia` 变化。返回当前是否 dark（备用）。
- `src/stores/settings.ts`：新增 `accent: AccentTheme` 字段（默认 `'teal'`），`load` 读取 settings 表 key `accent`，`setAccent` 持久化。
- `src/features/settings/SettingsPage.tsx`：外观卡片新增「主题色」行——4 个色块圆点按钮（各主题色填充，选中态 accent ring），点击即时 `setAccent`。
- 三窗口主题同步：
  - `App.tsx`：`setTheme`/`setAccent` 后 `emit('theme://changed', { theme, accent })`；继续监听系统深浅色变化并广播。
  - `QuickWindow.tsx` / `WidgetWindow.tsx`：改用 `useThemeSync()`，启动应用 + 实时跟随（修复现有不跟随主题的 bug）。

### 6.2 数据

settings 表新增 key `accent`，值为 `'teal' | 'indigo' | 'coral' | 'slate'` 字符串。后端 `settingsAll`/`settingsSet` 是通用 KV，无需 Rust 改动。

## 7. 测试与验收

- `theme.test.ts` 扩展：accent class 应用、非法值回退 teal、`resolveDark` 原有断言保持。
- `npm run test` 全绿；`npm run build` 通过。
- 手动验收矩阵：3 窗口 × 4 主题色 × 浅/深色；设置页切换即时生效且 quick/widget 跟随；重启后保持；`prefers-reduced-motion` 模拟验证动画关闭。
- 每步完成后 git 提交（中文提交信息）。

## 8. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/index.css` | 主体：token 区、精修、动效 |
| `src/lib/theme.ts` + `theme.test.ts` | accent 支持、useThemeSync |
| `src/stores/settings.ts` | accent 字段 |
| `src/features/settings/SettingsPage.tsx` | 主题色选择行 |
| `src/App.tsx` | key 淡入、主题广播 |
| `src/features/quick/QuickWindow.tsx`、`src/features/widget/WidgetWindow.tsx` | useThemeSync |
| `src/features/tasks/TaskCard.tsx` | PRIORITY_COLORS 对齐 |
| `index.html` | 标题改 MyDesk |
| `.gitignore` | 加 `.superpowers/`（已完成） |

## 9. 明确不做（YAGNI）

CSS 拆文件、组件库抽组件、退场动画、列表编排式入场动画、拖拽跟随动画、间距/字号全量 token、README 截图、自动生成色板。
