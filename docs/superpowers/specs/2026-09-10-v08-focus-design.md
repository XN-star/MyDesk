# v0.8「专注版」设计（MyDesk）

日期：2026-09-10
状态：执行中（依据 docs/superpowers/specs/2026-09-09-roadmap-v06-v10.md 第 2 节 v0.8）

## 0. 目标与边界

时间维度闭环：**任务计时器**（新表 time_entries，迁移 v8）+ **番茄钟**（25/5 档位，可绑当前计时任务）+ **今日工时总结**（概览卡片，纯函数聚合）。

验收：对任务一键计时 → 托盘可见 → 番茄结束自动停 → 概览看到今日专注分布。

**明确不做（YAGNI）**：手动补录时间段、计时历史编辑、多计时器并行、番茄白噪音/主题、托盘图标真进度弧绘制（以 tooltip 秒数展示进度，图标弧留待打磨清单）。

## 1. 数据层（迁移 v7→v8）

```sql
CREATE TABLE IF NOT EXISTS time_entries (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  started_at TEXT NOT NULL,   -- 'YYYY-MM-DDTHH:MM:SS'
  ended_at   TEXT             -- NULL=进行中
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries (task_id, started_at);
```

- `SCHEMA_V8`（新库直接 v8）、`MIGRATE_V8`、`upgrade_to_v8()`；`user_version` 收敛 **8**。
- 迁移测试：新库含 time_entries、v7 库升级后旧数据保留、幂等。
- **同一时间只允许一个计时**：start 时若存在 `ended_at IS NULL` 的条目，先自动 stop 它（ended_at=now）再开新条目。

## 2. Rust 模型与 Commands

```rust
pub struct TimeEntry { id, task_id, started_at, ended_at: Option<String> }
pub const TIME_ENTRY_COLS / TIME_ENTRY_INSERT
pub fn query_running_entry(c) -> Result<Option<TimeEntry>>        // ended_at IS NULL
pub fn query_entries_between(c, from, to) -> Vec<TimeEntry>       // 今日工时用
```

| command | 参数 | 返回 | 说明 |
|---|---|---|---|
| `timer_start` | `taskId` | `TimeEntry` | 已有进行中则先自动停；校验任务存在 |
| `timer_stop` | — | `Option<TimeEntry>` | 停止当前计时；无进行中返回 None |
| `timer_status` | — | `Option<RunningTimer>` | `{ entry, taskTitle, elapsedSec }`，托盘与前端共用 |
| `time_entries` | `from, to` | `Vec<TimeEntry>` | 区间条目 |
| `pomodoro_set` | `focusMin, breakMin` | `()` | settings 表存 `pomodoroFocus/pomodoroBreak`（默认 25/5） |

`RunningTimer { entry: TimeEntry, task_title: String, elapsed_sec: i64 }`（serde camelCase）。

## 3. 番茄钟服务（timer.rs，新）

复用 reminders 的线程模式：独立 1s 心跳线程。

- `advance(now_sec, phase, phase_ends_at, ...) -> Action` 纯函数（TDD，不碰 IO）：
  - focus 阶段到点 → 发通知「专注结束，休息 X 分钟」+ 自动 `timer_stop` + 切 break；
  - break 到点 → 发通知「休息结束」+ 切回 focus 待机；
  - 未开启番茄（普通计时）不干预，仅刷新托盘。
- 托盘 tooltip：空闲 `MyDesk 个人工作台`；计时中 `正在专注：{标题} (mm:ss)`；番茄休息中 `休息中 (mm:ss)`。
- 番茄状态机存线程内（单实例）；`pomodoro_start/pomodoro_stop` 两个 command 由前端触发（绑定当前计时任务，无计时则仅跑钟）。
- 结束通知走现有 tauri_plugin_notification。

## 4. 备份 v8

- VERSION 7→8：导出增加 `timeEntries`；导入缺失视为空（兼容 v1–v7）；事务内清表重插。
- 测试：roundtrip 含计时条目、v7 备份导入兼容、version 断言 7→8。

## 5. 前端

### 5.1 类型与 store

- `types.ts`：`TimeEntry { id; taskId; startedAt; endedAt: string | null }`、`RunningTimer { entry; taskTitle; elapsedSec }`。
- `api.ts`：`timerStart/timerStop/timerStatus/timeEntries/pomodoroSet/pomodoroStart/pomodoroStop`。
- `stores/timer.ts`：`running: RunningTimer | null`、`load/refresh(1s 轮询仅当页面可见或计时中)/start(taskId)/stop`。

### 5.2 UI

- **TaskCard**：右上 ▶/⏸ 按钮（点击不触发卡片打开），开始/停止计时。
- **TaskDrawer**：「开始专注」按钮（创建模式下提示先保存）。
- **TimerBar**：主窗口 TodayBar 下常驻细条（仅计时中显示）：`▶ 任务标题 mm:ss · ⏹ 停止 · 🍅 番茄`；点 🍅 弹出番茄档位（25/5 或自定义分钟），开启后显示阶段与倒计时。
- **今日专注卡片**：`todayFocus(entries, tasks, now)` 纯函数（TDD）——总时长（分钟）、按任务分布 Top3；概览第七卡片，点击进看板。

## 6. 涉及文件

| 文件 | 变更 |
|---|---|
| src-tauri/src/db.rs | SCHEMA_V8/MIGRATE_V8/upgrade_to_v8 + 测试 |
| src-tauri/src/models.rs | TimeEntry + 查询函数 + 测试 |
| src-tauri/src/commands.rs | timer×4 + pomodoro×3 |
| src-tauri/src/timer.rs | 心跳线程 + advance 纯函数 + 托盘 tooltip |
| src-tauri/src/backup.rs | VERSION 8 + timeEntries + 测试 |
| src-tauri/src/lib.rs | mod timer + 注册 command + TimerState |
| src/types.ts / lib/api.ts | TimeEntry/RunningTimer + api |
| src/stores/timer.ts | 计时 store |
| src/features/tasks/TaskCard.tsx / TaskDrawer.tsx | ▶ / 开始专注 |
| src/components/TimerBar.tsx | 常驻计时条 |
| src/App.tsx | 挂 TimerBar |
| src/features/overview/todayFocus（overview.ts +test） | 今日专注纯函数 |
| src/features/overview/OverviewPage.tsx | 第七卡片 |
| src/index.css | TimerBar/按钮样式 |
| package.json / tauri.conf.json / Cargo.toml | 0.8.0 |

## 7. 验收

- 看板卡片 ▶ 开始计时，TimerBar 显示 mm:ss，托盘 tooltip 同步「正在专注：X (mm:ss)」
- 开第二个计时时第一个自动停止落库
- 番茄 25 分钟到点自动停止计时并弹通知，进入 5 分钟休息，休息结束弹通知
- 概览「今日专注」卡片显示总时长与按任务分布
- vitest 全绿 + cargo test 全绿 + npm run build 通过
