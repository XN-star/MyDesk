# 多看板模块设计（MyDesk v0.5）

日期：2026-09-09
状态：已批准（总体设计第 11 节预留的「多看板」扩展方向，board_id 字段自 v1 起预留）

## 1. 目标与边界

任务按看板分组：看板页顶部切换器新建/切换/重命名/删除看板，任务归属各自看板；其余模块（日历、概览、今日栏、快速面板）聚合全部看板任务。默认看板 `default`（名称「默认看板」）不可删除。

**明确不做（YAGNI）**：看板拖拽排序、看板颜色/图标、跨看板拖任务（抽屉下拉可改归属已覆盖）、看板归档、任务跨看板移动的批量操作。

## 2. 数据层（迁移 v5→v6）

### 2.1 新表 boards

```sql
CREATE TABLE boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- `SCHEMA_V6`（新库直接建 v6 形态）、`MIGRATE_V6`（仅补建 boards 表 + 种子默认看板）、`upgrade_to_v6()`；`user_version` 收敛 **6**。
- 种子：v5→v6 迁移时 `INSERT INTO boards (id, name, ...) VALUES ('default', '默认看板', ...)`（`INSERT OR IGNORE`，幂等）；新库由 SCHEMA_V6 后同样执行种子插入。
- `tasks.board_id` 保持既有字段不变（存量任务已全部为 'default'，与新默认看板 id 天然对齐，零数据迁移）。

### 2.2 Rust 模型（models.rs）

```rust
pub struct Board { pub id: String, pub name: String, pub created_at: String, pub updated_at: String }
pub struct BoardInput { pub name: String }   // serde camelCase
pub const BOARD_COLS / BOARD_INSERT;
pub fn board_from_row / query_all_boards (ORDER BY created_at)
```

### 2.3 Commands（commands.rs）

| command | 参数 | 返回 | 说明 |
|---|---|---|---|
| `board_list` | — | `Vec<Board>` | 按 created_at 升序（default 恒第一） |
| `board_create` | `input: BoardInput` | `Board` | uuid |
| `board_rename` | `id: String, name: String` | `Board` | 刷新 updated_at |
| `board_delete` | `id: String` | `()` | 事务内先 `DELETE FROM tasks WHERE board_id=?` 再删看板；拒绝删除 `default`（返回错误文案） |
| `task_create` | 修改：`input.boardId?: String` | `Task` | 无/空则 `'default'` |

`task_list` 不变（仍返回全量任务，前端按看板过滤）。

`link_run`、备份不变。`backup.rs` **VERSION 6**：导出增加 `"boards"`；导入兼容无 `boards` 字段的 v1–v5 备份（视为空，事务内 `DELETE FROM boards` 后重插；若导入的备份无 boards 且无 tasks.board_id 变化，应用后默认看板缺失——导入后补种子 `INSERT OR IGNORE default`）；版本断言测试同步 5→6。

### 2.4 capabilities / lib.rs

`generate_handler` 注册 4 个 board command。

## 3. 前端

### 3.1 类型与 API

- `types.ts`：`Board { id; name; createdAt; updatedAt }`、`BoardInput { name }`；`TaskInput` 加 `boardId?: string`。
- `api.ts`：`boardList/boardCreate/boardRename/boardDelete`；`taskCreate` 透传 boardId。

### 3.2 stores/boards.ts（新）

Zustand：`boards: Board[]`、`activeBoardId: string`（初始 `'default'`）、`load()`（拉取看板；若 activeBoardId 不在列表中重置为第一个）、`create(name)`、`rename(id, name)`、`remove(id)`（确认后调用；删除后若删的是 active 切回 default）、`setActive(id)`。activeBoardId **不持久化**（每次启动回到 default，YAGNI）。

### 3.3 stores/tasks.ts 改造

- `create(input)`：input.boardId 缺省时后端落 default，无需前端处理。
- 其余不动（列表仍是全量，看板页过滤）。

### 3.4 看板页切换器（KanbanPage）

- 列头左侧加看板切换器：`<select>` 列出全部看板 + 尾部「＋ 新建看板…」选项。
- 选中「＋」→ 弹窗输入名称创建并切换；选中看板即 `setActive`。
- 看板名旁 ✎（重命名）与 🗑（删除，confirm 提示「看板内 N 个任务将一并删除」；default 不显示删除钮）。重命名/新建共用一个居中小弹窗（复用 `.overlay.center`/`.dialog` 样式，一个文本框 + 保存/取消，同快捷入口 LinkDialog 模式）。
- 任务列表按 `tasks.filter(t => t.boardId === activeBoardId)` 过滤后走既有三列渲染与 dnd（`applyMove` 输入已过滤数组，sort_order 中点算法在同看板内依旧正确）。
- TaskDrawer 的打开不依赖看板；抽屉内加「所属看板」下拉（boardList 全量），改后 `taskUpdate` 保存 boardId；看板页列表随过滤即时归位。

### 3.5 其余模块（聚合语义，改动小）

- **日历**：不变（本就显示全量任务）。DayPanel 新建任务走 `taskCreate({ ..., boardId: 'default' })`——实际由后端缺省落 default，前端不传。
- **快速面板**：QuickWindow `taskCreate` 不传 boardId → 落 default。搜索结果列表不变（全量）。
- **概览**：不变（全量统计）。
- **今日栏 TodayBar**：不变（全量 summarize）。

### 3.6 registry / 设置页

不新增模块——多看板是任务看板模块的能力增强。设置页模块开关不变。

## 4. 错误处理

- 删除 default：后端拒绝，前端 toast 后端错误文案。
- 看板重名：允许（id 区分），不做唯一校验（YAGNI）。
- 删除看板时 tasks 事务删除，失败整体回滚并 toast。
- dnd 落库失败回滚逻辑沿用既有实现。

## 5. 测试

- Rust：迁移（新库 v6 含 boards+种子、v5→v6 数据保留+种子、幂等）、boards roundtrip/排序、board_create/rename/delete（含 default 拒删与连带删任务）、备份 v6 roundtrip + v5 备份导入兼容（无 boards 字段→导入后种子补齐）。
- Vitest：boards store（load/create/remove 后 active 切换）；KanbanPage 过滤逻辑抽纯函数 `tasksOfBoard(tasks, boardId)` 放 `features/tasks/dnd.ts` 并测试。
- 冒烟：新建看板→切换→各建任务→抽屉改归属→删除看板连带删任务→default 拒删→重启持久→日历/概览聚合可见全部。

## 6. 文档

README：任务看板条目补「支持多看板分组，看板页顶部切换」；已知说明中「MVP 单看板」一条删除。
