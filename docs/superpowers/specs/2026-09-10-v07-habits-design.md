# v0.7「习惯版」设计（MyDesk）

日期：2026-09-10
状态：执行中（依据 docs/superpowers/specs/2026-09-09-roadmap-v06-v10.md 第 2 节 v0.7）

## 0. 目标与边界

两大块：**习惯追踪模块**（新模块 + 迁移 v7）与**重复任务**（tasks 加 repeat 列，迁移 v7 同批）。

**明确不做（YAGNI）**：计数型习惯（v0.7 仅 boolean 打卡，值存 0/1，表结构已预留 value 可扩展）、完整 RRULE（三档简单规则）、习惯归档/排序、提醒文案高级配置。

## 1. 数据层（迁移 v6→v7）

### 1.1 新表

```sql
CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  frequency  TEXT NOT NULL DEFAULT 'daily',   -- daily | weekly | monthly
  reminder   TEXT,                             -- 'HH:MM' 或 NULL
  archived   INTEGER NOT NULL DEFAULT 0,       -- 预留，UI 暂不暴露
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id       TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date     TEXT NOT NULL,                     -- 'YYYY-MM-DD'
  value    INTEGER NOT NULL DEFAULT 1,        -- boolean 习惯：1=完成 0=未完成（SKIP 预留 2）
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id, date);
```

`tasks` 加列：`ALTER TABLE tasks ADD COLUMN repeat TEXT;`（NULL=一次性；'daily'|'weekly'|'monthly'）。

- `SCHEMA_V7`（新库直接 v7 形态，含 habits/habit_logs + tasks.repeat）、`MIGRATE_V7`（v6 库补建两表 + ADD COLUMN）、`upgrade_to_v7()`；`user_version` 收敛 **7**。
- 迁移测试：新库→v7 全表齐、v6 库升级后旧数据保留、幂等。

### 1.2 Rust 模型（models.rs）

```rust
pub struct Habit { id, name, frequency, reminder: Option<String>, archived: bool, created_at, updated_at }
pub struct HabitInput { name, frequency(默认 daily), reminder: Option<String> }
pub struct HabitLog { id, habit_id, date, value }
pub const HABIT_COLS / HABIT_INSERT / HABIT_LOG_COLS / HABIT_LOG_INSERT
pub fn habit_from_row / query_all_habits (ORDER BY created_at)
pub fn query_logs_between(c, from, to)   -- 全习惯区间日志（热力图一次拉全量）
```

Task 结构体加 `pub repeat: Option<String>`（serde camelCase `repeat`），TASK_COLS/INSERT/UPDATE 同步。

### 1.3 Commands（commands.rs，沿用 with_conn）

| command | 参数 | 返回 | 说明 |
|---|---|---|---|
| `habit_list` | — | `Vec<Habit>` | created_at 升序 |
| `habit_create` | `input: HabitInput` | `Habit` | uuid |
| `habit_update` | `habit: Habit` | `Habit` | 全量更新，刷新 updated_at |
| `habit_delete` | `id` | `()` | 事务内先删 habit_logs 再删 habits |
| `habit_toggle` | `id, date` | `HabitLog` | 当日已完成则删该日志（取消打卡）返回空？——改为返回 `Option<HabitLog>`；打卡则插入 value=1 |
| `habit_logs` | `from, to` | `Vec<HabitLog>` | 热力图/统计用 |
| `task_create` | 扩展：input.repeat | Task | 直存 |

`lib.rs` 注册 6 个新 command。

### 1.4 备份（backup.rs）VERSION 6→7

- 导出增加 `habits`、`habitLogs`；tasks 带 repeat。
- 导入接受 version≤7：`habits`/`habitLogs` 缺失视为空数组（兼容 v1–v6）；事务内 DELETE 后重插（含 habit_logs）。
- 现有测试 version 断言 6→7；新增含习惯 roundtrip 测试与 v6 备份导入兼容测试。

### 1.5 习惯提醒（reminders.rs）

复用现有 30s 轮询：`tick` 内增加 habit 扫描——`SELECT habits WHERE reminder IS NOT NULL`，当 `now` 的 HH:MM == reminder 且当日未打卡且未在 Notified 集合（key=`habit:{id}:{date}`）时弹通知「习惯打卡：{name}」。`Notified` 继续复用（HashSet<String>）。
测试：抽 `due_habits(conn, now) -> Vec<(String,String)>` 纯查询函数测窗口与去重键。

## 2. 习惯算法（前端纯函数，features/habits/habits.ts，TDD）

移植 uhabits 官方算法（调研核实：`uhabits-core/models/Score.kt` + `ScoreList.kt`）：

```ts
// EWMA：α = 1 - 0.5^(√f / 13)，f = 每周目标次数 / 7？—— 用官方定义 f = numerator/denominator
export function multiplier(f: number): number          // 0.5 ** (Math.sqrt(f) / 13)
export function habitScore(prev: number, f: number, checkmark: number): number
  // score = prev * m + checkmark * (1 - m)
```

- 频率映射：daily → f=1；weekly → f=1/7；monthly → f=1/30。
- 官方对非每日 boolean 习惯分子分母加倍平滑（`numerator*=2, denominator*=2`）：等效 f 加倍，即 weekly f=2/7、monthly f=1/15（=2/30）。直接在 f 映射中体现。
- checkmark（滚动窗口完成率）：daily → 当日 0/1；weekly → 近 7 天完成天数（窗口内 min(1, count/1)？——**取简**：v0.7 三档都按「当日 0/1 + 非 daily 用加倍 f 缓冲」处理，不实现滚动窗口，理由：boolean 打卡只有 0/1，滚动窗口完成率对 weekly 的实际效果等价于更慢的衰减，f 加倍已覆盖；在代码注释标注与官方 ScoreList 的差异）。
- SKIP（value=2）当天冻结：既不加分也不衰减。

```ts
export function computeScores(habit: Habit, logs: HabitLog[], today: string): number[]
  // 从 habit.created_at 日期（或首个日志日）逐日迭代到 today，返回每日分数 0..1
export function currentScore(habit, logs, today): number       // 最后一个分数
export function streak(logs: HabitLog[], today: string): number
  // 从今天（或昨天）往回数连续 value=1 天数；今天未打卡不打断（从昨天起算），value=2(SKIP) 不打断
export function bestStreak(logs: HabitLog[]): number
export function heatmapData(logs: HabitLog[], weeks = 52, today: string): Array<{ date: string; value: number }>
  // 52 周 ×7 网格，无日志日 value=0
```

Vitest：multiplier 数值（对照官方测试 `1 - 0.5^(1/13) ≈ 0.051922`）、分数迭代、streak 边界（今天未打卡/SKIP）、heatmap 形状。

## 3. 习惯页面（features/habits/）

- **HabitsPage**：上下两段。上段「今日打卡」列表（每行：名称、频率标签、今日勾选框、当前分数百分比、连续天数🔥）；下段选中习惯的 52 周热力图（GitHub contributions 式，5 色阶，CSS grid）+ 最佳/当前 streak + 新建/编辑弹窗（名称、频率三档、提醒时刻可选）+ 删除（confirm）。
- **stores/habits.ts**（Zustand）：`habits/logs/load/create/update/remove/toggle/selectedId`；logs 全量拉取（近 1 年）。
- **modules/meta.ts + registry.ts**：注册 `{ id: 'habits', name: '习惯', icon: '◉', defaultEnabled: true }`（mergeNewDefaultModules 机制自动向老用户并入）。
- **概览**：`todayHabits(habits, logs)` 纯函数 + 第六卡片「今日习惯」（n/m 已打卡，列出未完成前几项）。

## 4. 重复任务

- **抽屉/日历面板**：提醒选项旁加「重复」select（不重复/每天/每周/每月）；TaskInput/Task 类型加 `repeat`。
- **完成时顺延**（前端实现，取简）：`KanbanPage/DayPanel/TaskCard` 完成任务处调用 store 新方法 `completeTask(task)`：
  - `repeat` 为空 → 原逻辑；
  - 非空且 dueAt 存在 → 更新原任务 status=done，随后 `taskCreate` 一个相同 title/description/priority/repeat、dueAt=nextOccurrence(dueAt, repeat) 的新任务；
  - 纯函数 `nextOccurrence(dueAt: string, repeat: string): string` 放 features/tasks/dnd.ts 旁新文件 features/tasks/repeat.ts（TDD：每天+1d、每周+7d、每月+1 月、无 dueAt 时返回 null 不生成）。
- 日历/概览无需改动（聚合全量任务，新任务自然出现）。

## 5. 涉及文件

| 文件 | 变更 |
|---|---|
| src-tauri/src/db.rs | SCHEMA_V7/MIGRATE_V7/upgrade_to_v7 + 测试 |
| src-tauri/src/models.rs | Habit/HabitLog/HabitInput + Task.repeat + 测试 |
| src-tauri/src/commands.rs | habit×6 command + task_create.repeat |
| src-tauri/src/backup.rs | VERSION 7 + habits/habitLogs + 测试 |
| src-tauri/src/reminders.rs | due_habits + tick 集成 + 测试 |
| src-tauri/src/lib.rs | 注册 command |
| src/types.ts / lib/api.ts | Habit/HabitLog/HabitInput/Task.repeat + api |
| src/features/habits/habits.ts (+test) | 评分/streak/heatmap/今日打卡 |
| src/features/tasks/repeat.ts (+test) | nextOccurrence |
| src/stores/habits.ts / tasks.ts | 新 store；tasks.completeTask |
| src/features/habits/HabitsPage.tsx | 习惯页面 |
| src/features/tasks/TaskDrawer.tsx / TaskCard.tsx / KanbanPage.tsx | repeat 选择/徽标/完成顺延 |
| src/features/calendar/DayPanel.tsx | repeat 选择 |
| src/features/overview/overview.ts (+test) / OverviewPage.tsx | 今日习惯卡片 |
| src/modules/meta.ts / registry.ts | 注册 habits |
| src/index.css | 热力图与习惯页样式 |
| package.json / tauri.conf.json / Cargo.toml | 0.7.0 |

## 6. 验收

- 能建「每周三次健身」式习惯（weekly）并打卡，看到分数与热力图、连续天数
- 习惯设提醒时刻后，到点弹系统通知（当日未打卡才提醒）
- 概览出现「今日习惯」卡片
- 「每天喝水」任务完成后自动生成明天的一单；「每周X」「每月X号」同理
- vitest 全绿 + cargo test 全绿 + npm run build 通过
