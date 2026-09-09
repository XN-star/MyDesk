# 多看板模块（MyDesk v0.5）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 任务按看板分组：boards 表（迁移 v6）+ 看板 CRUD + 看板页切换器 + 抽屉改归属；日历/概览/快速面板聚合全部看板任务。

**Architecture:** Rust 侧沿用版本化迁移 + with_conn command 模式；`tasks.board_id` 复用既有字段（存量任务天然属于 default 看板，零数据迁移）；前端看板过滤用纯函数 `tasksOfBoard`，看板切换器内嵌 KanbanPage。设计文档：`docs/superpowers/specs/2026-09-09-multi-board-design.md`。

**Tech Stack:** Tauri 2 (rusqlite/chrono/uuid) · React 19 · Zustand 5 · Vitest 5。

## Global Constraints

- UI 文案简体中文；serde camelCase。
- `user_version` 收敛 **6**；迁移链 0/1/2/3/4/5→6 数据零丢失，迁移幂等。
- `boards` 表种子：id='default'、name='默认看板'（`INSERT OR IGNORE`，迁移与新库都执行）。
- `board_delete` 拒绝删除 'default'；连带删除看板内任务（事务）。
- 备份 `VERSION = 6`；导入兼容无 boards 字段的 v1–v5 备份，导入后种子补齐 default。
- 时间戳 `%Y-%m-%dT%H:%M:%S`；提交信息中文 `--no-verify`。
- 不引入新依赖。

---

### Task 1: db.rs 迁移 v6（boards 表 + 种子）

**Files:**
- Modify: `src-tauri/src/db.rs`

**Interfaces:**
- Produces: `SCHEMA_V6: &str`（tasks+notes+links+boards+settings）、`MIGRATE_V6: &str`（补建 boards + 种子）、`seed_default_board(conn)`、`upgrade_to_v6()`、`SCHEMA_V5: &str`（测试构造 v5 库用）；`user_version=6`。

- [ ] **Step 1: 写失败测试**

db.rs 测试：`fresh_db_creates_all_tables_at_v5` → `fresh_db_creates_all_tables_at_v6`（表数 4→5，IN 列表加 'boards'，version 5→6）；`v1/v2/v3/v4` 测试函数名与断言 5→6；`v4_db_upgrades_to_v5_keeps_data` → `v4_db_upgrades_to_v6_keeps_data`，version 断言改 6；追加：

```rust
    #[test]
    fn v5_db_upgrades_to_v6_seeds_default_board() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V5).unwrap();
        c.execute_batch("PRAGMA user_version = 5;").unwrap();
        c.execute(
            "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, created_at, updated_at) VALUES ('t1', 'default', '旧任务', '', 'todo', 1, NULL, 100.0, NULL, 0, '2026-09-09T10:00:00', '2026-09-09T10:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 6);
        let name: String = c
            .query_row("SELECT name FROM boards WHERE id='default'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "默认看板");
        let kept: String = c
            .query_row("SELECT title FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "旧任务");
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test db::tests`
Expected: FAIL（version 仍 5 / boards 表不存在）。

- [ ] **Step 3: 最小实现**

`db.rs`：把现有 `SCHEMA_V5` 内容改名 `SCHEMA_V6` 并追加 boards 建表；原 v5 语句体保留为 `SCHEMA_V5`（注释「仅测试用」）；新增：

```rust
/// v5→v6：新增 boards 表并种下默认看板。
pub const MIGRATE_V6: &str = "
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO boards (id, name, created_at, updated_at) VALUES ('default', '默认看板', '2026-09-09T00:00:00', '2026-09-09T00:00:00');
";
```

`SCHEMA_V6` 尾部同样含 boards 建表（不含 INSERT，种子统一走 `seed_default_board` 或直接让全新库分支也执行 `MIGRATE_V6` 的种子部分——实现取：全新库分支 `execute_batch(SCHEMA_V6)` 后调用 `conn.execute_batch("INSERT OR IGNORE INTO boards (id, name, created_at, updated_at) VALUES ('default', '默认看板', '2026-09-09T00:00:00', '2026-09-09T00:00:00')")`，抽成 `pub fn seed_default_board(conn: &Connection) -> rusqlite::Result<()>` 供两处复用）。

`migrate()`：所有 `SCHEMA_V5`/`5` → `SCHEMA_V6`/`6`；末尾统一：

```rust
    upgrade_to_v4(conn)?;
    upgrade_to_v5(conn)?;
    upgrade_to_v6(conn)?;
    conn.pragma_update(None, "user_version", 6)?;
```

```rust
fn upgrade_to_v6(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "boards")? {
        conn.execute_batch(MIGRATE_V6)?;
    } else {
        seed_default_board(conn)?;
    }
    Ok(())
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test db::tests`
Expected: 全 PASS（含幂等）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/db.rs
git commit --no-verify -m "feat: 数据库迁移 v6——boards 表与默认看板种子"
```

---

### Task 2: models.rs Board 模型 + task_create 接收 boardId

**Files:**
- Modify: `src-tauri/src/models.rs`（Board/BOARD_COLS/BOARD_INSERT/board_from_row/query_all_boards；`TaskInput` 加 `board_id`）
- Modify: `src-tauri/src/commands.rs`（task_create 使用 input.board_id）

**Interfaces:**
- Produces: `Board { id, name, created_at, updated_at }`（camelCase）、`BoardInput { name }`、`BOARD_COLS`/`BOARD_INSERT`/`query_all_boards`（ORDER BY created_at）；`TaskInput.board_id: Option<String>`（serde default）。

- [ ] **Step 1: 写失败测试**

models.rs 测试追加：

```rust
    #[test]
    fn board_roundtrip_and_order() {
        let c = mem();
        c.execute(BOARD_INSERT, params!["b2", "工作", "2026-09-09T10:00:00", "2026-09-09T10:00:00"]).unwrap();
        c.execute(BOARD_INSERT, params!["default", "默认看板", "2026-09-09T00:00:00", "2026-09-09T00:00:00"]).unwrap();
        let got = query_all_boards(&c).unwrap();
        let ids: Vec<&str> = got.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, vec!["default", "b2"]);
        assert_eq!(got[0].name, "默认看板");
    }

    #[test]
    fn task_input_board_default() {
        let json = r#"{"title":"买牛奶"}"#;
        let input: TaskInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.board_id, None);
        let json2 = r#"{"title":"工作","boardId":"b2"}"#;
        let input2: TaskInput = serde_json::from_str(json2).unwrap();
        assert_eq!(input2.board_id.as_deref(), Some("b2"));
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test models::tests`
Expected: FAIL（BOARD_INSERT 未定义）。

- [ ] **Step 3: 最小实现**

models.rs 常量追加：

```rust
pub const BOARD_COLS: &str = "id, name, created_at, updated_at";
pub const BOARD_INSERT: &str =
    "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?1,?2,?3,?4)";
```

类型追加（LinkInput 后）：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardInput {
    pub name: String,
}
```

`TaskInput` 增加字段：

```rust
    #[serde(default)]
    pub board_id: Option<String>,
```

查询追加（query_all_links 后）：

```rust
pub fn board_from_row(r: &Row) -> rusqlite::Result<Board> {
    Ok(Board {
        id: r.get(0)?,
        name: r.get(1)?,
        created_at: r.get(2)?,
        updated_at: r.get(3)?,
    })
}

pub fn query_all_boards(c: &Connection) -> rusqlite::Result<Vec<Board>> {
    let mut stmt = c.prepare(&format!("SELECT {BOARD_COLS} FROM boards ORDER BY created_at"))?;
    let rows = stmt.query_map([], board_from_row)?;
    rows.collect()
}
```

commands.rs `task_create` 中 `board_id: "default".into()` 改为：

```rust
            board_id: input.board_id.unwrap_or_else(|| "default".into()),
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/models.rs src-tauri/src/commands.rs
git commit --no-verify -m "feat: Board 数据模型与任务归属看板"
```

---

### Task 3: board CRUD commands + lib.rs 注册

**Files:**
- Modify: `src-tauri/src/commands.rs`（task_delete 后追加 4 个）
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `board_list() -> Vec<Board>`、`board_create(input: BoardInput) -> Board`、`board_rename(id, name) -> Board`、`board_delete(id) -> ()`。

- [ ] **Step 1: 实现**

commands.rs 追加：

```rust
#[tauri::command]
pub fn board_list(db: DbState) -> Result<Vec<Board>, String> {
    with_conn(db, query_all_boards)
}

#[tauri::command]
pub fn board_create(db: DbState, input: BoardInput) -> Result<Board, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let b = Board {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            created_at: now.clone(),
            updated_at: now,
        };
        c.execute(BOARD_INSERT, params![b.id, b.name, b.created_at, b.updated_at])?;
        Ok(b)
    })
}

#[tauri::command]
pub fn board_rename(db: DbState, id: String, name: String) -> Result<Board, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        c.execute(
            "UPDATE boards SET name=?2, updated_at=?3 WHERE id=?1",
            params![id, name, now],
        )?;
        Ok(Board { name, updated_at: now, ..query_one_board(c, &id)? })
    })
}

#[tauri::command]
pub fn board_delete(db: DbState, id: String) -> Result<(), String> {
    if id == "default" {
        return Err("默认看板不能删除".into());
    }
    with_conn(db, move |c| {
        let tx = c.transaction()?;
        tx.execute("DELETE FROM tasks WHERE board_id=?1", params![id])?;
        tx.execute("DELETE FROM boards WHERE id=?1", params![id])?;
        tx.commit()?;
        Ok(())
    })
}
```

models.rs 追加辅助（query_all_boards 后）：

```rust
pub fn query_one_board(c: &Connection, id: &str) -> rusqlite::Result<Board> {
    c.query_row(
        &format!("SELECT {BOARD_COLS} FROM boards WHERE id=?1"),
        params![id],
        board_from_row,
    )
}
```

lib.rs generate_handler 追加：

```rust
            commands::board_list,
            commands::board_create,
            commands::board_rename,
            commands::board_delete,
```

- [ ] **Step 2: 运行全量后端测试**

Run: `cd src-tauri && cargo test`
Expected: 编译通过全 PASS。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/src/models.rs
git commit --no-verify -m "feat: 看板 CRUD command（default 拒删、连带删任务）"
```

---

### Task 4: backup.rs v6（TDD）

**Files:**
- Modify: `src-tauri/src/backup.rs`

**Interfaces:**
- Produces: `VERSION=6`；导出含 `"boards"`；导入兼容无 boards 备份并补种子。

- [ ] **Step 1: 测试修改/追加**

既有两条 version 断言 5→6；追加：

```rust
    #[test]
    fn export_import_preserves_boards() {
        let src = mem();
        src.execute(
            crate::models::BOARD_INSERT,
            params!["b1", "工作", "2026-09-09T10:00:00", "2026-09-09T10:00:00"],
        )
        .unwrap();
        let file = std::env::temp_dir().join(format!("ws-bk-boards-{}.json", std::process::id()));
        export(&src, &file).unwrap();

        let mut dst = mem();
        import(&mut dst, &file).unwrap();
        let boards = crate::models::query_all_boards(&dst).unwrap();
        assert!(boards.iter().any(|b| b.id == "b1" && b.name == "工作"));
        assert!(boards.iter().any(|b| b.id == "default"), "导入后 default 看板必须存在");

        let text = std::fs::read_to_string(&file).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["version"], 6);
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_v5_backup_without_boards_seeds_default() {
        let file = std::env::temp_dir().join(format!("ws-bk-v5nob-{}.json", std::process::id()));
        std::fs::write(
            &file,
            r#"{
              "version": 5,
              "tasks": [],
              "notes": [],
              "links": [],
              "settings": []
            }"#,
        )
        .unwrap();

        let mut c = mem();
        let n = import(&mut c, &file).unwrap();
        assert_eq!(n, 0);
        let ids: Vec<String> = crate::models::query_all_boards(&c)
            .unwrap()
            .into_iter()
            .map(|b| b.id)
            .collect();
        assert!(ids.contains(&"default".to_string()), "旧备份导入后需补种子 default");
        std::fs::remove_file(&file).ok();
    }
```

- [ ] **Step 2: 确认失败**

Run: `cd src-tauri && cargo test backup::tests`
Expected: 新用例 FAIL。

- [ ] **Step 3: 最小实现**

`VERSION = 6`；export json! 加 `"boards": query_all_boards(conn)?`；import 解析（links 之后）：

```rust
    let boards: Vec<Board> = match doc.get("boards") {
        Some(v) => serde_json::from_value(v.clone()).context("boards 字段格式错误")?,
        None => Vec::new(),
    };
```

事务：`tx.execute("DELETE FROM boards", [])?;`；插入循环：

```rust
    for b in &boards {
        tx.execute(BOARD_INSERT, params![b.id, b.name, b.created_at, b.updated_at])?;
    }
    // 任何备份导入后保证 default 看板存在
    tx.execute(
        "INSERT OR IGNORE INTO boards (id, name, created_at, updated_at) VALUES ('default', '默认看板', '2026-09-09T00:00:00', '2026-09-09T00:00:00')",
        [],
    )?;
```

- [ ] **Step 4: 确认通过**

Run: `cd src-tauri && cargo test`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/backup.rs
git commit --no-verify -m "feat: 备份格式 v6——含看板导出导入并保证 default 存在"
```

---

### Task 5: 前端类型/API + boards store + tasksOfBoard 纯函数（TDD）

**Files:**
- Modify: `src/types.ts`、`src/lib/api.ts`
- Create: `src/stores/boards.ts`、`src/stores/boards.test.ts`
- Modify: `src/features/tasks/dnd.ts`（追加 tasksOfBoard）、`src/features/tasks/dnd.test.ts`（追加用例）
- Modify: `src/types.ts` TaskInput 加 boardId

**Interfaces:**
- Produces: `Board { id; name; createdAt; updatedAt }`、`BoardInput { name }`、`TaskInput.boardId?: string`；`api.boardList/boardCreate/boardRename/boardDelete`；`useBoardsStore`（boards/activeBoardId/load/create/rename/remove/setActive）；`tasksOfBoard(tasks: Task[], boardId: string): Task[]`。

- [ ] **Step 1: 类型与 API（tsc 验证）**

types.ts 追加：

```typescript
export interface Board {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardInput {
  name: string;
}
```

`TaskInput` 加 `boardId?: string;`。api.ts 追加：

```typescript
  boardList: () => invoke<Board[]>('board_list'),
  boardCreate: (input: BoardInput) => invoke<Board>('board_create', { input }),
  boardRename: (id: string, name: string) => invoke<Board>('board_rename', { id, name }),
  boardDelete: (id: string) => invoke<void>('board_delete', { id }),
```

- [ ] **Step 2: dnd.test.ts 追加失败用例**

```typescript
describe('tasksOfBoard', () => {
  it('只保留指定看板任务', () => {
    const a = { ...base, id: 'a', boardId: 'default' };
    const b = { ...base, id: 'b', boardId: 'work' };
    expect(tasksOfBoard([a, b], 'work')).toEqual([b]);
  });
});
```

（`base` 为该文件既有测试的任务工厂；若无则按文件内现有模式构造。）运行 `npx vitest run src/features/tasks/dnd.test.ts` 确认 FAIL。

- [ ] **Step 3: dnd.ts 实现**

```typescript
/** 过滤出指定看板的任务（保持原顺序）。 */
export function tasksOfBoard(tasks: Task[], boardId: string): Task[] {
  return tasks.filter((t) => t.boardId === boardId);
}
```

- [ ] **Step 4: boards store 测试（失败）**

`src/stores/boards.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  boardList: vi.fn(async () => []),
  boardCreate: vi.fn(),
  boardRename: vi.fn(),
  boardDelete: vi.fn(async () => {}),
}));

vi.mock('../lib/api', () => ({ api }));

import { useBoardsStore } from './boards';

describe('boards store', () => {
  beforeEach(() => {
    useBoardsStore.setState({ boards: [], activeBoardId: 'default' });
    vi.clearAllMocks();
  });

  it('load 后 activeBoardId 失效时重置为第一个看板', async () => {
    api.boardList.mockResolvedValueOnce([
      { id: 'default', name: '默认看板', createdAt: '', updatedAt: '' },
      { id: 'w', name: '工作', createdAt: '', updatedAt: '' },
    ]);
    useBoardsStore.setState({ activeBoardId: 'gone' });
    await useBoardsStore.getState().load();
    expect(useBoardsStore.getState().activeBoardId).toBe('default');
  });

  it('删除当前看板后切回 default', async () => {
    useBoardsStore.setState({
      boards: [
        { id: 'default', name: '默认看板', createdAt: '', updatedAt: '' },
        { id: 'w', name: '工作', createdAt: '', updatedAt: '' },
      ],
      activeBoardId: 'w',
    });
    await useBoardsStore.getState().remove('w');
    expect(api.boardDelete).toHaveBeenCalledWith('w');
    expect(useBoardsStore.getState().activeBoardId).toBe('default');
    expect(useBoardsStore.getState().boards).toHaveLength(1);
  });
});
```

Run: `npx vitest run src/stores/boards.test.ts` 确认 FAIL。

- [ ] **Step 5: 实现 store**

`src/stores/boards.ts`：

```typescript
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Board } from '../types';
import { useTaskStore } from './tasks';
import { useUiStore } from './ui';

interface BoardsState {
  boards: Board[];
  activeBoardId: string;
  load: () => Promise<void>;
  setActive: (id: string) => void;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBoardsStore = create<BoardsState>((set, get) => ({
  boards: [],
  activeBoardId: 'default',

  load: async () => {
    try {
      const boards = await api.boardList();
      set((s) => ({
        boards,
        activeBoardId: boards.some((b) => b.id === s.activeBoardId)
          ? s.activeBoardId
          : boards[0]?.id ?? 'default',
      }));
    } catch (e) {
      useUiStore.getState().toast(`加载看板失败：${e}`, 'error');
    }
  },

  setActive: (id) => set({ activeBoardId: id }),

  create: async (name) => {
    try {
      const b = await api.boardCreate({ name });
      set((s) => ({ boards: [...s.boards, b], activeBoardId: b.id }));
    } catch (e) {
      useUiStore.getState().toast(`新建看板失败：${e}`, 'error');
      throw e;
    }
  },

  rename: async (id, name) => {
    try {
      const saved = await api.boardRename(id, name);
      set((s) => ({ boards: s.boards.map((b) => (b.id === id ? saved : b)) }));
    } catch (e) {
      useUiStore.getState().toast(`重命名失败：${e}`, 'error');
      throw e;
    }
  },

  remove: async (id) => {
    try {
      await api.boardDelete(id);
    } catch (e) {
      useUiStore.getState().toast(`删除看板失败：${e}`, 'error');
      return;
    }
    set((s) => ({
      boards: s.boards.filter((b) => b.id !== id),
      activeBoardId: s.activeBoardId === id ? 'default' : s.activeBoardId,
    }));
    await useTaskStore.getState().load();
  },
}));
```

- [ ] **Step 6: 确认通过并提交**

Run: `npx vitest run src/stores/boards.test.ts src/features/tasks/dnd.test.ts && npx tsc --noEmit`
Expected: PASS、零错误。

```bash
git add src/types.ts src/lib/api.ts src/stores/boards.ts src/stores/boards.test.ts src/features/tasks/dnd.ts src/features/tasks/dnd.test.ts
git commit --no-verify -m "feat: 看板 store、类型与按看板过滤纯函数"
```

---

### Task 6: KanbanPage 切换器 + TaskDrawer 看板下拉

**Files:**
- Modify: `src/features/tasks/KanbanPage.tsx`
- Modify: `src/features/tasks/TaskDrawer.tsx`
- Modify: `src/index.css`
- Modify: `src/App.tsx`（App 级 load boards——在 settings load 后追加 `useBoardsStore.getState().load()`）

**Interfaces:**
- Consumes: Task 5 全部；既有 `useUiStore.drawer`、`useTaskStore`。

- [ ] **Step 1: App.tsx 启动加载看板**

`useSettingsStore.getState().load().then(...)` 回调中追加 `useBoardsStore.getState().load();`。

- [ ] **Step 2: KanbanPage 加切换器**

KanbanPage 顶部（`.kanban` 之前）加一行：

```tsx
<div className="board-bar">
  <BoardSelect />
  {activeBoard && activeBoard.id !== 'default' && (
    <>
      <button className="btn" onClick={() => setRenameOpen(true)}>✎</button>
      <button className="btn danger" onClick={() => void handleDeleteBoard()}>🗑</button>
    </>
  )}
</div>
```

页面组件内：

```tsx
const boards = useBoardsStore((s) => s.boards);
const activeBoardId = useBoardsStore((s) => s.activeBoardId);
const setBoardActive = useBoardsStore((s) => s.setActive);
const createBoard = useBoardsStore((s) => s.create);
const removeBoard = useBoardsStore((s) => s.removeBoard);
const renameBoard = useBoardsStore((s) => s.rename);
const loadBoards = useBoardsStore((s) => s.load);
// activeBoardId 失效兜底：boards 加载后若当前 id 不存在则回落 default
useEffect(() => {
  if (boards.length > 0 && !boards.some((b) => b.id === activeBoardId)) {
    setBoardActive(boards[0].id);
  }
}, [boards, activeBoardId, setBoardActive]);
```

`BoardSelect` 内联子组件：`<select value={activeBoardId} onChange={...}>` 列出 boards + `<option value="__new__">＋ 新建看板…</option>`；onChange 遇 `__new__` 打开新建弹窗（复用 LinkDialog 模式的 BoardDialog：一个 name 输入框，保存调 `createBoard(name)`）。重命名按钮打开同弹窗（预填名称，保存调 `renameBoard`）。

删除确认：

```tsx
async function handleDeleteBoard() {
  const count = useTaskStore.getState().tasks.filter((t) => t.boardId === activeBoardId).length;
  const ok = await confirm(`删除看板「${activeBoard.name}」？其中 ${count} 个任务将一并删除。`, {
    title: '删除看板',
  });
  if (ok) await removeBoard(activeBoardId);
}
```

**注意 store 方法名统一为 `remove`（Task 5 定义），此处按 `remove` 调用。**

页面过滤：把现有 `tasks` 的消费替换为 `const visible = tasksOfBoard(tasks, activeBoardId);`，三列渲染与 dnd 的 `applyMove` 均基于 `visible`。新建任务（`useUiStore.drawer` create 模式）提交时 `TaskInput` 带 `boardId: activeBoardId`。

- [ ] **Step 3: TaskDrawer 加所属看板下拉**

抽屉表单中（优先级字段附近）加：

```tsx
<div className="field">
  <label>所属看板</label>
  <select
    className="input"
    value={draft.boardId}
    onChange={(e) => setDraft({ ...draft, boardId: e.target.value })}
  >
    {boards.map((b) => (
      <option key={b.id} value={b.id}>{b.name}</option>
    ))}
  </select>
</div>
```

（按 TaskDrawer 既有 draft state 模式接入；编辑保存时 boardId 随 taskUpdate 落库。）

- [ ] **Step 4: 样式**

index.css 追加：

```css
/* 看板切换器 */
.board-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.board-bar select { width: 200px; }
```

- [ ] **Step 5: 全量验证**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全 PASS、零错误。

- [ ] **Step 6: 提交**

```bash
git add src/features/tasks/ src/App.tsx src/index.css
git commit --no-verify -m "feat: 看板页切换器（新建/重命名/删除）与抽屉改归属"
```

---

### Task 7: README + 冒烟

- [ ] **Step 1: README**

任务看板条目改为「待办/进行中/已完成三列，拖拽换状态、列内排序，优先级与截止时间，过期标红；支持多看板分组，看板页顶部切换。」；「已知说明」中删除「MVP 单看板；数据层已预留 board_id 多看板字段。」一条。

- [ ] **Step 2: 全量测试**

Run: `npx vitest run && cd src-tauri && cargo test`
Expected: 全绿。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit --no-verify -m "docs: README 补充多看板说明"
```

- [ ] **Step 4: 冒烟（Tauri 窗口）**

1. 看板页顶部出现看板下拉（默认看板）；新建「工作」看板并自动切换。
2. 「工作」里建任务；切回默认看板列表为空（互不混淆）；默认看板原任务仍在。
3. 编辑任务抽屉改所属看板 → 保存后列表即时归位。
4. 删除「工作」→ 确认文案含任务数 → 任务连带删除。
5. 尝试删 default → toast「默认看板不能删除」。
6. 日历/概览/今日栏聚合全部看板任务；快速面板建任务落默认看板。
7. 重启持久；备份导出含 boards、导入兼容。

---

## Self-Review 记录

- **Spec 覆盖**：§2.1 迁移 v6+种子（T1）、§2.2 模型（T2）、§2.3 commands 与 task_create boardId（T2/T3）、§2.4 注册（T3）、§2.4 备份 v6（T4）、§3.1 类型 API（T5）、§3.2 store（T5）、§3.4 切换器/过滤/抽屉（T6，含 App 级 load）、§3.5 聚合语义（无代码改动，T7 冒烟验证）、§4 错误处理（T3 default 拒删 / T6 确认文案）、§5 测试（各任务）、§6 README（T7）。
- **占位符**：无 TBD。T6 中 store 方法名以 T5 实际定义为准（已注明 remove）。
- **类型一致性**：`Board`/`BoardInput` 前后端一致；`tasksOfBoard` 在 T5 定义 T6 使用；`useBoardsStore` 方法签名 T5/T6 一致；备份测试 v5 JSON 无 boards 字段与导入兼容逻辑一致。
