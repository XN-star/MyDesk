# 概览（信息小部件）模块设计（MyDesk v0.4）

日期：2026-09-09
状态：已批准（基于 2026-09-07 总体设计第 11 节预留的「信息小部件」扩展方向）

## 1. 目标与边界

新增第五个模块「概览」：聚合展示四个既有模块的关键信息，作为工作台首页。侧边栏第一项，默认启用，可在设置页关闭。**纯前端聚合**——不新增数据表、不做数据库迁移、不改备份格式。

**明确不做（YAGNI）**：卡片自定义排序/显隐配置、自动轮询刷新、天气/日历等外部数据源、小部件拖拽布局。

## 2. 页面结构（`features/overview/OverviewPage.tsx`）

进入页面时并发拉取四个 store 的数据并渲染四张卡片，自上而下：

```
┌──────────────────────────────────────────────┐
│ 概览                                （进入时刷新）│
├──────────────┬──────────────┬──────────────┤
│ 📋 今日任务    │ ⏰ 即将到期    │ 📝 最近笔记    │
│ 待办 3 进行 1  │ · 报告 2小时后 │ · 周报 10:32  │
│ 已完 2 逾期 1  │ · 会议 5小时后 │ · 备忘 昨天    │
│              │ · 复盘 明天    │ · 清单 9/7    │
├──────────────┴──────────────┴──────────────┤
│ ⚡ 常用入口：[Gmail] [素材] [构建] [文档] …     │
└──────────────────────────────────────────────┘
```

### 2.1 今日任务卡片

- 数据：`useTaskStore` 的 tasks。
- 展示：今日待办数（status=todo 且 due_at 为今天，或无截止的待办不计）、进行中数、今日已完成数（done_at 为今天）、逾期数（未完成且 due_at < 今天）。
- 纯函数 `taskStats(tasks, now)`（`features/overview/overview.ts`）：返回 `{ todoToday, doing, doneToday, overdue }`。
- 点击卡片 → `useUiStore.setPage('tasks')`。

### 2.2 即将到期卡片

- 数据：tasks 中未完成、due_at 在未来 7 天内的任务，按 due_at 升序取前 5。
- 纯函数 `upcomingTasks(tasks, now, days=7, limit=5)`：返回 `Task[]`。
- 每行显示标题 + `dueLabel(due_at)`（复用 `format.ts`）；空态「7 天内没有到期任务」。
- 点击卡片 → `setPage('tasks')`。

### 2.3 最近笔记卡片

- 数据：`useNotesStore` 的 notes（后端已按 updated_at 倒序）取前 5。
- 纯函数 `recentNotes(notes, limit=5)`。
- 每行显示标题（空则「无标题」）+ `timeShort(updatedAt)`；空态「还没有笔记」。
- 点击卡片 → `setPage('notes')`。

### 2.4 常用入口卡片

- 数据：`useLinksStore` 的 links（后端按 sort_order）取前 6。
- 纯函数 `frequentLinks(links, limit=6)`。
- 横向 chip 布局：图标+标题；空态「还没有快捷入口」。
- 点击单个 chip → 直接调用 `useLinksStore.open(link)` 打开；点击卡片空白 → `setPage('links')`。

## 3. 数据流与刷新

- `OverviewPage` 挂载时 `Promise.all` 并发调用四个 store 的 `load()`（tasks/notes/links；任务 store 已有 tasks 无需额外接口）。
- 不做自动轮询；切换回本页时组件重新挂载即自动刷新。
- 各 store 已有错误 toast 机制，页面无需重复处理。

## 4. 模块注册（`modules/registry.ts`）

```ts
{ id: 'overview', name: '概览', icon: '◈', description: '今日信息一览', defaultEnabled: true, route: '/overview', component: OverviewPage }
```

- 放在 MODULES 数组首位（侧边栏第一项）。
- 老用户自动启用：复用 `mergeNewDefaultModules`（settings load 时自动并入）。
- `ui.ts` 的 `activePage` 初始值仍为 `'tasks'`，不改动默认落地页；概览是可选项而非强制首页。

## 5. 测试

- Vitest 纯函数：`taskStats`（含跨天/逾期/今日完成边界）、`upcomingTasks`（7 天窗口、排序、limit）、`recentNotes`、`frequentLinks`。
- registry.test.ts 更新为五个内置模块断言。
- 手工冒烟：四卡片数据正确、点击跳转/打开行为、空态展示、设置页可关闭、浅/深主题。

## 6. 文档

- README 功能清单加「概览」一行（放在最前）。
