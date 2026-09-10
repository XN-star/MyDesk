# v0.6「焊接版」设计（MyDesk）

日期：2026-09-10
状态：执行中（依据 docs/superpowers/specs/2026-09-09-roadmap-v06-v10.md 第 2 节 v0.6）

## 0. 目标与边界

四个低成本高联动功能，打通既有模块，全部为纯前端或极小改动，**无表结构变更（不迁移）**：

1. 每日笔记：日历 DayPanel 一键打开/创建当日笔记
2. 快速面板语法增强：重复提醒短语 + `#标签`
3. 快捷入口增强：序号直达 + `/关键词` 过滤直达
4. 概览周报卡片：本周完成/新建/逾期与上周环比

**明确不做（YAGNI）**：每日笔记的日历视图聚合（笔记不进月历圆点）、重复任务生成（v0.7）、快速面板搜笔记（v0.9 全局搜索统一做）、入口热键全局注册（仅快速面板内）。

## 1. 每日笔记

### 1.1 纯函数（features/notes/notes.ts，TDD）

```ts
export function dailyNoteTitle(date: string): string  // '2026-09-10' → '9月10日'
export function findDailyNote(notes: Note[], date: string): Note | null
  // title === dailyNoteTitle(date) 的第一条（后端已按置顶+更新时间排序）
```

### 1.2 notes store 扩展

`openOrCreateDaily(date: string): Promise<void>`：先 `load()` 保证数据新鲜 → `findDailyNote` 命中则 `select(id)`；未命中则 `api.noteCreate({ title: dailyNoteTitle(date), content: '' })` 后本地插入置顶选中（复用 create 的插入逻辑形态）。

### 1.3 DayPanel UI

DayPanel 底部加「📝 打开/创建当日笔记」按钮：`openOrCreateDaily(date)` → `useUiStore.setPage('notes')`。按钮文案动态：当日笔记已存在时显示「打开当日笔记」，否则「创建当日笔记」。DayPanel 通过 props 接收 notes（或直接 useNotesStore 取 notes，保持组件自治，与取 tasks 同风格）。

## 2. 快速面板语法增强（parseQuickTask 扩展）

`ParsedQuickTask` 增加 `remindMinutesBefore: number | null`（默认 null，沿用现有字段语义：null=不提醒）。

### 2.1 重复短语 → 提醒（取简：不做 RRULE，仅触发提醒选项）

- 「每天 HH:MM」→ dueAt=明天该时刻（或今天未过则今天），remindMinutesBefore=0（准点提醒）
- 「每周X HH:MM」→ dueAt=下一个周X该时刻，remind=0
- 「每月X号 HH:MM」→ dueAt=本月或下月 X 号该时刻，remind=0
- 带重复短语时即使无显式 HH:MM 也默认 09:00，保证 reminders 引擎有触发点
- 解析后从标题中移除短语

### 2.2 `#标签` → 描述前缀

- 捕获所有 `#xxx`（支持中文，`/#([^\s#]+)/g`），标题移除标签词，description = `标签：a、b`；无标签时 description 为空
- `#` 后无字符或纯符号则不识别（保留原文本）

### 2.3 QuickWindow 适配

- createTask 透传 `remindMinutesBefore` 与 `description`
- 提示 placeholder 更新为含「每天 9:00 / #标签」示例

## 3. 快捷入口增强（QuickWindow 内）

### 3.1 纯函数（features/links/links.ts，TDD）

```ts
export function numberedLinks(links: Link[], q: string): { links: Link[]; index: number } | null
  // q === ' '（单个空格）或 ' N'（空格+序号）时命中；返回前 9 个入口与序号；否则 null
```

实现取简：在 QuickWindow 中判断 `q` 以空格开头（`/^\s?\d?$/`）时展示入口模式：列表显示前 9 个入口（1-9 序号），回车打开当前选中；继续输入数字切换选中。

### 3.2 `/关键词` 过滤

`q` 以 `/` 开头时：`searchLinks(links, q.slice(1))` 过滤入口，回车直接 open 当前选中（不再 emit 到主窗）。

### 3.3 QuickWindow 改造

- 输入分三种模式：默认（任务搜索/创建）、入口模式（空格/序号）、bang 模式（/ 开头）
- 入口/ bang 模式下回车在快速窗口内完成（emit `quick://changed` 不需要；直接 `api.linkOpen/linkRun`），成功后 hide
- Hit 类型扩展 `type: 'task' | 'link'`

## 4. 概览周报卡片

### 4.1 纯函数（features/overview/overview.ts，TDD）

```ts
export interface WeekReport {
  done: number; created: number; overdue: number;        // 本周
  donePrev: number; createdPrev: number; overduePrev: number; // 上周
  weekStart: string; // 本周一 'YYYY-MM-DD'
}
export function weekReport(tasks: Task[], now: Date): WeekReport
```

- 周一为一周起点（周日起算前一周）：`weekStart = now - ((day+6)%7) 天`
- 本周区间 `[weekStart, weekStart+7d)`；上周同理
- done：`status==='done' && doneAt 在区间`；created：`createdAt 在区间`；overdue：`未完成 && dueAt < now` 且 dueAt 落在区间前（逾期是存量概念，按「截止早于 now 且未完成」计，区间维度对逾期无意义——**取简**：overdue 直接复用当前口径不分周，上周值=0 且 UI 不展示环比）。
  - 修正：为避免歧义，overdue 定义为「本周内某日起到期、至今未完成」，即 `dueAt < now && dueAt >= weekStart && status!=='done'`；上周 overduePrev 同理取上周区间。UI 三项均展示环比。

### 4.2 OverviewPage

第五张卡片「📈 本周回顾」：完成 n（环比 +x）、新建 n（环比 ±x）、逾期 n（环比 +x/-x）；环比=本周-上周，正负染色（完成/新建正为绿语义加号即可，复用 `.overdue-num` 红色警示逾期增加）。点击跳转日历页。

## 5. 涉及文件

| 文件 | 变更 |
|---|---|
| features/notes/notes.ts (+test) | dailyNoteTitle / findDailyNote |
| stores/notes.ts | openOrCreateDaily |
| features/calendar/DayPanel.tsx | 每日笔记按钮 |
| features/quick/parseQuickTask.ts (+test) | 重复短语 + #标签 |
| features/quick/QuickWindow.tsx | 透传新字段 + 入口/bang 模式 |
| features/links/links.ts (+test) | 入口过滤复用 searchLinks（无新函数则不增） |
| features/overview/overview.ts (+test) | weekReport |
| features/overview/OverviewPage.tsx | 第五卡片 |
| index.css | 每日笔记按钮与周报环比样式 |
| package.json / tauri.conf.json / Cargo.toml | 0.6.0 |

## 6. 验收

- 日历点日期 → 一键打开/创建当日笔记（标题 9月10日 式）
- 快速面板「每天 9:00 喝水 #健康」→ 建出明天(或今天)9 点、准点提醒、描述含标签的任务
- 快速面板空格 → 前九入口序号直达；`/so` → 过滤入口回车即开
- 概览第五卡片显示本周完成/新建/逾期与上周环比
- vitest 全绿 + `cargo test` 全绿 + `npm run build` 通过
