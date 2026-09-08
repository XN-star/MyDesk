# 笔记模块（MyDesk v0.2）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有任务看板、日历之外新增「笔记」模块：纯文本、双栏布局、搜索、置顶、1 秒防抖自动保存，数据入 SQLite（迁移 v4），备份格式 v4 兼容旧版。

**Architecture:** 复用现有三层模式——Rust 侧 db.rs 版本化迁移 + models.rs 行映射 + commands.rs with_conn command；前端 registry 模块注册 + Zustand store（本地即时更新、防抖持久化）+ 纯函数（搜索/分组/摘要/排序）单测。设计文档：`docs/superpowers/specs/2026-09-08-notes-module-design.md`。

**Tech Stack:** Tauri 2 (rusqlite/chrono/uuid) · React 19 · TypeScript · Zustand 5 · Vitest 5（jsdom, globals）。

## Global Constraints

- UI 文案全部简体中文；代码标识符英文。
- serde 一律 `#[serde(rename_all = "camelCase")]`，与前端 camelCase 对齐。
- `PRAGMA user_version` 收敛到 **4**；所有旧库路径（0/1/2/3）迁移后任务数据零丢失。
- 备份 `VERSION = 4`；导入接受 `version <= 4`；校验失败零写入。
- 时间戳格式与现有一致：`%Y-%m-%dT%H:%M:%S`（`commands::now_iso`）。
- 测试命令：前端 `npx vitest run`；后端 `cd src-tauri && cargo test`。
- 提交信息中文，前缀 `feat:`/`test:`/`docs:`/`chore:`，`--no-verify`（Mimosa 钩子按兼容策略放行）。
- 不引入任何新依赖。

---

### Task 1: db.rs 迁移 v3→v4（notes 表）

**Files:**
- Modify: `src-tauri/src/db.rs`

**Interfaces:**
- Produces: `SCHEMA_V4: &str`（含 tasks + notes + settings 的建表批语句）、`upgrade_to_v4(conn) -> rusqlite::Result<()>`；`migrate()` 收敛 `user_version = 4`。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/db.rs` 的 `mod tests` 中，把 `fresh_db_creates_tasks_with_remind_col_at_v3` 整体替换为：

```rust
    #[test]
    fn fresh_db_creates_all_tables_at_v4() {
        let c = mem();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','settings','notes')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 3);
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 4);
        assert!(column_exists(&c, "tasks", "remind_minutes_before").unwrap());
        assert!(column_exists(&c, "notes", "pinned").unwrap());
    }
```

并把 `v1_db_migrates_events_into_tasks_then_v3` 与 `v2_db_upgrades_to_v3` 中的断言 `assert_eq!(v, 3);` 改为 `assert_eq!(v, 4);`（函数名同步改为 `..._then_v4` / `v2_db_upgrades_to_v4`），再追加一个 v3 库升级测试：

```rust
    #[test]
    fn v3_db_upgrades_to_v4_keeps_tasks() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V3).unwrap();
        c.execute_batch("PRAGMA user_version = 3;").unwrap();
        c.execute(
            "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, created_at, updated_at) VALUES ('t1', 'default', '旧任务', '', 'todo', 1, '2026-09-09T10:00:00', 100.0, NULL, Some(0), '2026-09-07T09:00:00', '2026-09-07T09:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 4);
        let kept: String = c
            .query_row("SELECT title FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "旧任务");
        assert!(table_exists(&c, "notes").unwrap());
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test db::`
Expected: FAIL（断言 user_version==4 不成立 / notes 表不存在）。

- [ ] **Step 3: 最小实现**

`db.rs` 主体改动：

```rust
/// v4 建表语句（新库直接为此形态）：tasks + notes。
pub const SCHEMA_V4: &str = "
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL DEFAULT 'default',
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo',
  priority    INTEGER NOT NULL DEFAULT 1,
  due_at      TEXT,
  sort_order  REAL NOT NULL,
  done_at     TEXT,
  remind_minutes_before INTEGER,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v3→v4：新增 notes 表。
pub const MIGRATE_V3_TO_V4: &str = "
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
";
```

把原 `SCHEMA_V3` 的文档注释改为「仅用于迁移测试中构造 v3 库」，其余不动。`migrate()` 改为（凡到达 v3 后一律再 `upgrade_to_v4`，`user_version` 写 4）：

```rust
pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        let has_events: bool = table_exists(conn, "events")?;
        let has_tasks: bool = table_exists(conn, "tasks")?;
        if has_events {
            conn.execute_batch(SCHEMA_V1)?;
            migrate_v1_to_v2(conn)?;
            upgrade_to_v3(conn)?;
        } else if has_tasks {
            conn.execute_batch(SCHEMA_V2)?;
            upgrade_to_v3(conn)?;
        } else {
            conn.execute_batch(SCHEMA_V4)?;
            conn.pragma_update(None, "user_version", 4)?;
            return Ok(());
        }
    } else if version == 1 {
        migrate_v1_to_v2(conn)?;
        upgrade_to_v3(conn)?;
    } else if version == 2 {
        upgrade_to_v3(conn)?;
    }
    upgrade_to_v4(conn)?;
    conn.pragma_update(None, "user_version", 4)?;
    Ok(())
}

fn upgrade_to_v4(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "notes")? {
        conn.execute_batch(MIGRATE_V3_TO_V4)?;
    }
    Ok(())
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test db::`
Expected: 全部 PASS（含幂等测试 `migrate_is_idempotent` 不变仍通过）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/db.rs
git commit --no-verify -m "feat: 数据库迁移 v4——新增 notes 表"
```

---

### Task 2: models.rs 的 Note 模型与查询

**Files:**
- Modify: `src-tauri/src/models.rs`

**Interfaces:**
- Produces: `Note { id: String, title: String, content: String, pinned: bool, created_at: String, updated_at: String }`（serde camelCase）、`NoteInput { title: String, content: String }`、`NOTE_COLS: &str`、`NOTE_INSERT: &str`、`note_from_row(&Row) -> rusqlite::Result<Note>`、`query_all_notes(&Connection) -> rusqlite::Result<Vec<Note>>`（`ORDER BY pinned DESC, updated_at DESC`）。

- [ ] **Step 1: 写失败测试**

在 `src-tauri/src/models.rs` 的 `mod tests` 中追加：

```rust
    #[test]
    fn note_roundtrip_via_row_mapping() {
        let c = mem();
        c.execute(
            NOTE_INSERT,
            params!["n1", "会议记录", "第一行内容", 1, "2026-09-08T10:00:00", "2026-09-08T10:00:00"],
        )
        .unwrap();
        let got = query_all_notes(&c).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "n1");
        assert_eq!(got[0].title, "会议记录");
        assert_eq!(got[0].content, "第一行内容");
        assert!(got[0].pinned);
        assert_eq!(got[0].created_at, "2026-09-08T10:00:00");
    }

    #[test]
    fn notes_order_pinned_then_updated_desc() {
        let c = mem();
        c.execute(NOTE_INSERT, params!["a", "旧未置顶", "", 0, "2026-09-08T09:00:00", "2026-09-08T09:00:00"]).unwrap();
        c.execute(NOTE_INSERT, params!["b", "新未置顶", "", 0, "2026-09-08T11:00:00", "2026-09-08T11:00:00"]).unwrap();
        c.execute(NOTE_INSERT, params!["p", "置顶", "", 1, "2026-09-08T08:00:00", "2026-09-08T08:00:00"]).unwrap();
        let got = query_all_notes(&c).unwrap();
        let ids: Vec<&str> = got.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, vec!["p", "b", "a"]);
    }

    #[test]
    fn note_input_defaults() {
        let json = r#"{"title":"随手记"}"#;
        let input: NoteInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.title, "随手记");
        assert_eq!(input.content, "");
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test models::`
Expected: FAIL（NOTE_INSERT / query_all_notes 未定义，编译错误）。

- [ ] **Step 3: 最小实现**

`models.rs` 追加（放在 SettingRow 之后、`task_from_row` 之前均可）：

```rust
pub const NOTE_COLS: &str = "id, title, content, pinned, created_at, updated_at";
pub const NOTE_INSERT: &str =
    "INSERT INTO notes (id, title, content, pinned, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub title: String,
    #[serde(default)]
    pub content: String,
}

pub fn note_from_row(r: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        title: r.get(1)?,
        content: r.get(2)?,
        pinned: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

pub fn query_all_notes(c: &Connection) -> rusqlite::Result<Vec<Note>> {
    let mut stmt =
        c.prepare(&format!("SELECT {NOTE_COLS} FROM notes ORDER BY pinned DESC, updated_at DESC"))?;
    let rows = stmt.query_map([], note_from_row)?;
    rows.collect()
}
```

（rusqlite 的 `bool` 与 SQLite INTEGER 0/1 自动互转，无需手写 FromSql。）

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test models::`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/models.rs
git commit --no-verify -m "feat: Note 数据模型与排序查询"
```

---

### Task 3: commands.rs 四个 note command + lib.rs 注册

**Files:**
- Modify: `src-tauri/src/commands.rs`（在 `task_delete` 之后追加）
- Modify: `src-tauri/src/lib.rs:91-101`（`generate_handler!` 列表）

**Interfaces:**
- Consumes: Task 2 的 `Note`/`NoteInput`/`query_all_notes`/`NOTE_INSERT`；`commands::now_iso`。
- Produces: Tauri command `note_list() -> Vec<Note>`、`note_create(input: NoteInput) -> Note`、`note_update(note: Note) -> Note`（服务端刷新 updated_at）、`note_delete(id: String) -> ()`。

- [ ] **Step 1: 实现 command（本任务以编译 + 既有测试回归为验证）**

`commands.rs` 在 `task_delete` 之后追加：

```rust
#[tauri::command]
pub fn note_list(db: DbState) -> Result<Vec<Note>, String> {
    with_conn(db, query_all_notes)
}

#[tauri::command]
pub fn note_create(db: DbState, input: NoteInput) -> Result<Note, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let n = Note {
            id: Uuid::new_v4().to_string(),
            title: input.title,
            content: input.content,
            pinned: false,
            created_at: now.clone(),
            updated_at: now,
        };
        c.execute(
            NOTE_INSERT,
            params![n.id, n.title, n.content, n.pinned, n.created_at, n.updated_at],
        )?;
        Ok(n)
    })
}

#[tauri::command]
pub fn note_update(db: DbState, note: Note) -> Result<Note, String> {
    with_conn(db, move |c| {
        c.execute(
            "UPDATE notes SET title=?2, content=?3, pinned=?4, updated_at=?5 WHERE id=?1",
            params![note.id, note.title, note.content, note.pinned, now_iso()],
        )?;
        Ok(Note { updated_at: now_iso(), ..note })
    })
}

#[tauri::command]
pub fn note_delete(db: DbState, id: String) -> Result<(), String> {
    with_conn(db, move |c| {
        c.execute("DELETE FROM notes WHERE id=?1", params![id])?;
        Ok(())
    })
}
```

（文件顶部 `use crate::models::*;` 已存在，`Note`/`NoteInput`/`query_all_notes`/`NOTE_INSERT` 自动可用。）

`lib.rs` 的 `generate_handler![...]` 追加四行：

```rust
            commands::note_list,
            commands::note_create,
            commands::note_update,
            commands::note_delete,
```

- [ ] **Step 2: 运行全量后端测试**

Run: `cd src-tauri && cargo test`
Expected: 编译通过，全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit --no-verify -m "feat: 笔记 CRUD command 并注册"
```

---

### Task 4: backup.rs v4（导出含笔记、导入兼容）

**Files:**
- Modify: `src-tauri/src/backup.rs`

**Interfaces:**
- Consumes: Task 2 的 `query_all_notes`/`NOTE_INSERT`。
- Produces: `VERSION = 4`；导出 JSON 增加 `"notes"` 字段；导入兼容无 `notes` 字段的 v1–v3 备份。

- [ ] **Step 1: 修改/新增测试**

`backup.rs` 测试模块：

1. `export_then_import_roundtrip_v3` 改名为 `export_then_import_roundtrip`，末尾断言 `assert_eq!(doc["version"], 3);` → `assert_eq!(doc["version"], 4);`。
2. 追加两条用例：

```rust
    #[test]
    fn export_import_preserves_notes() {
        let src = mem();
        src.execute(
            crate::models::NOTE_INSERT,
            params!["n1", "标题", "内容", 1, "2026-09-08T10:00:00", "2026-09-08T10:00:00"],
        )
        .unwrap();
        let file = std::env::temp_dir().join(format!("ws-bk-notes-{}.json", std::process::id()));
        export(&src, &file).unwrap();

        let mut dst = mem();
        import(&mut dst, &file).unwrap();
        let notes = crate::models::query_all_notes(&dst).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "标题");
        assert!(notes[0].pinned);

        let text = std::fs::read_to_string(&file).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["version"], 4);
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_v3_backup_without_notes_is_accepted() {
        let file = std::env::temp_dir().join(format!("ws-bk-v3nonotes-{}.json", std::process::id()));
        std::fs::write(
            &file,
            r#"{
              "version": 3,
              "tasks": [
                {"id":"t1","boardId":"default","title":"旧任务","description":"","status":"todo","priority":1,"dueAt":"2026-09-08T10:00:00","sortOrder":100,"doneAt":null,"remindMinutesBefore":0,"createdAt":"2026-09-07T09:00:00","updatedAt":"2026-09-07T09:00:00"}
              ],
              "settings": []
            }"#,
        )
        .unwrap();

        let mut c = mem();
        c.execute(crate::models::NOTE_INSERT, params!["n-old", "将被清空", "", 0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"]).unwrap();
        let n = import(&mut c, &file).unwrap();
        assert_eq!(n, 1);
        assert_eq!(query_all_tasks(&c).unwrap().len(), 1);
        assert_eq!(crate::models::query_all_notes(&c).unwrap().len(), 0, "旧备份无 notes，整库替换后为空");
        std::fs::remove_file(&file).ok();
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test backup::`
Expected: `export_import_preserves_notes` FAIL（导出没有 notes 字段）。

- [ ] **Step 3: 最小实现**

`backup.rs`：

```rust
pub const VERSION: i64 = 4;
```

`export` 中 doc 增加字段（`use crate::models::query_all_notes;` 经 `crate::models::*` 已可用）：

```rust
    let notes = query_all_notes(conn)?;
    let doc = json!({
        "version": VERSION,
        "exportedAt": crate::commands::now_iso(),
        "tasks": tasks,
        "notes": notes,
        "settings": settings,
    });
```

`import` 中在解析 settings 之后追加（`unwrap_or_default()` 对 `Value` 会得到 `Null`，反序列化 `Vec<Note>` 会报错，必须用 match 区分「缺字段」与「格式错」）：

```rust
    let notes: Vec<Note> = match doc.get("notes") {
        Some(v) => serde_json::from_value(v.clone()).context("notes 字段格式错误")?,
        None => Vec::new(),
    };
```

事务部分追加两行（放在 `DELETE FROM settings` 之后）：

```rust
    tx.execute("DELETE FROM notes", [])?;
```

插入循环追加（放在 settings 插入之前）：

```rust
    for n in &notes {
        tx.execute(
            NOTE_INSERT,
            params![n.id, n.title, n.content, n.pinned, n.created_at, n.updated_at],
        )?;
    }
```

返回值改为 `Ok(tasks.len() + converted.len() + notes.len())`。

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test`
Expected: 全部 PASS（含 `import_rejects_future_version_and_zero_writes` 不变仍通过）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/backup.rs
git commit --no-verify -m "feat: 备份格式 v4——含笔记导出导入并兼容旧版"
```

---

### Task 5: 前端类型 + API + format.timeShort

**Files:**
- Modify: `src/types.ts`（文件末尾追加）
- Modify: `src/lib/api.ts`（对象内追加）
- Modify: `src/lib/format.ts`（`dueLabel` 之后追加函数）
- Test: `src/lib/format.test.ts`（追加 describe）

**Interfaces:**
- Produces: `Note { id: string; title: string; content: string; pinned: boolean; createdAt: string; updatedAt: string }`、`NoteInput { title: string; content?: string }`；`api.noteList(): Promise<Note[]>`、`api.noteCreate(input: NoteInput): Promise<Note>`、`api.noteUpdate(note: Note): Promise<Note>`、`api.noteDelete(id: string): Promise<void>`；`timeShort(iso: string, now?: Date): string`（当天返回 `HH:mm`，跨天返回 `M/D`）。

- [ ] **Step 1: 写失败测试**

`src/lib/format.test.ts` 追加：

```typescript
describe('timeShort', () => {
  const now = new Date('2026-09-08T18:00:00');

  it('当天的笔记只显示时分', () => {
    expect(timeShort('2026-09-08T10:32:00', now)).toBe('10:32');
  });

  it('跨天显示 月/日', () => {
    expect(timeShort('2026-09-01T09:00:00', now)).toBe('9/1');
  });
});
```

（文件顶部 import 行补上 `timeShort`。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL（timeShort 未导出）。

- [ ] **Step 3: 最小实现**

`src/types.ts` 末尾追加：

```typescript
export interface Note {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  content?: string;
}
```

`src/lib/format.ts` 末尾追加：

```typescript
/** 笔记列表用的更新时间短格式：当天 HH:mm，跨天 M/D */
export function timeShort(iso: string, now: Date = new Date()): string {
  if (dateOf(iso) === toDateStr(now)) return iso.slice(11, 16);
  const [, m, d] = dateOf(iso)!.split('-');
  return `${Number(m)}/${Number(d)}`;
}
```

`src/lib/api.ts` 改为：

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { Task, TaskInput, Note, NoteInput } from '../types';

export const api = {
  taskList: () => invoke<Task[]>('task_list'),
  taskCreate: (input: TaskInput) => invoke<Task>('task_create', { input }),
  taskUpdate: (task: Task) => invoke<Task>('task_update', { task }),
  taskDelete: (id: string) => invoke<void>('task_delete', { id }),
  noteList: () => invoke<Note[]>('note_list'),
  noteCreate: (input: NoteInput) => invoke<Note>('note_create', { input }),
  noteUpdate: (note: Note) => invoke<Note>('note_update', { note }),
  noteDelete: (id: string) => invoke<void>('note_delete', { id }),
  settingsAll: () => invoke<Record<string, string>>('settings_all'),
  settingsSet: (key: string, value: string) => invoke<void>('settings_set', { key, value }),
  backupExport: (path: string) => invoke<void>('backup_export', { path }),
  backupImport: (path: string) => invoke<number>('backup_import', { path }),
};
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/lib/api.ts src/lib/format.ts src/lib/format.test.ts
git commit --no-verify -m "feat: Note 类型、API 封装与时间短格式"
```

---

### Task 6: notes.ts 纯函数（搜索/分组/摘要/排序）

**Files:**
- Create: `src/features/notes/notes.ts`
- Test: `src/features/notes/notes.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `Note` 类型。
- Produces: `searchNotes(notes: Note[], keyword: string): Note[]`、`splitPinned(notes: Note[]): [Note[], Note[]]`、`noteExcerpt(content: string): string`（首非空行，40 字截断）、`sortNotes(notes: Note[]): Note[]`（pinned DESC + updatedAt DESC，与后端排序一致）。

- [ ] **Step 1: 写失败测试**

`src/features/notes/notes.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import type { Note } from '../../types';
import { noteExcerpt, searchNotes, sortNotes, splitPinned } from './notes';

function note(partial: Partial<Note>): Note {
  return {
    id: 'x',
    title: '',
    content: '',
    pinned: false,
    createdAt: '2026-09-08T10:00:00',
    updatedAt: '2026-09-08T10:00:00',
    ...partial,
  };
}

describe('searchNotes', () => {
  const notes = [
    note({ id: '1', title: '会议记录', content: '讨论了预算' }),
    note({ id: '2', title: '购物清单', content: '牛奶、鸡蛋' }),
  ];

  it('空关键字返回全部', () => {
    expect(searchNotes(notes, '  ')).toHaveLength(2);
  });

  it('匹配标题或内容，不区分大小写', () => {
    expect(searchNotes(notes, '会议').map((n) => n.id)).toEqual(['1']);
    expect(searchNotes(notes, '牛奶').map((n) => n.id)).toEqual(['2']);
    expect(searchNotes(notes, 'TODO')).toHaveLength(0);
  });
});

describe('splitPinned', () => {
  it('拆分为置顶与未置顶两组并保持原顺序', () => {
    const [pinned, rest] = splitPinned([
      note({ id: 'a' }),
      note({ id: 'b', pinned: true }),
      note({ id: 'c' }),
    ]);
    expect(pinned.map((n) => n.id)).toEqual(['b']);
    expect(rest.map((n) => n.id)).toEqual(['a', 'c']);
  });
});

describe('noteExcerpt', () => {
  it('取首个非空行并去掉首尾空白', () => {
    expect(noteExcerpt('\n\n  第二行内容  \n第三行')).toBe('第二行内容');
  });

  it('超过 40 字截断加省略号', () => {
    const long = '一'.repeat(50);
    expect(noteExcerpt(long)).toBe('一'.repeat(40) + '…');
  });

  it('空内容返回空串', () => {
    expect(noteExcerpt('')).toBe('');
  });
});

describe('sortNotes', () => {
  it('置顶在前，同组内按更新时间倒序', () => {
    const sorted = sortNotes([
      note({ id: 'a', updatedAt: '2026-09-08T09:00:00' }),
      note({ id: 'b', updatedAt: '2026-09-08T11:00:00' }),
      note({ id: 'p', pinned: true, updatedAt: '2026-09-08T08:00:00' }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['p', 'b', 'a']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/features/notes/notes.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 最小实现**

`src/features/notes/notes.ts`：

```typescript
import type { Note } from '../../types';

/** 标题+内容不区分大小写包含匹配；关键字为空白时返回全部。 */
export function searchNotes(notes: Note[], keyword: string): Note[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return notes;
  return notes.filter(
    (n) => n.title.toLowerCase().includes(k) || n.content.toLowerCase().includes(k),
  );
}

/** 依赖后端已排序的输入，保持组内顺序拆为 [置顶, 其余]。 */
export function splitPinned(notes: Note[]): [Note[], Note[]] {
  return [notes.filter((n) => n.pinned), notes.filter((n) => !n.pinned)];
}

/** 列表摘要：首个非空行，超 40 字截断加省略号。 */
export function noteExcerpt(content: string): string {
  const line = content.split('\n').find((l) => l.trim() !== '') ?? '';
  const s = line.trim();
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

/** 本地更新后维持与后端一致的顺序：置顶在前，其余按更新时间倒序。 */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/features/notes/notes.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/notes/notes.ts src/features/notes/notes.test.ts
git commit --no-verify -m "feat: 笔记搜索/分组/摘要/排序纯函数"
```

---

### Task 7: stores/notes.ts（自动保存）与设置合并

**Files:**
- Create: `src/stores/notes.ts`
- Test: `src/stores/notes.test.ts`
- Modify: `src/stores/settings.ts`（load 中合并新默认模块）
- Modify: `src/stores/settings.ts`（导出纯函数 `mergeNewDefaultModules`）
- Test: `src/stores/settings.test.ts`（新建）

**Interfaces:**
- Consumes: Task 5 `api.note*`；Task 6 `sortNotes`；`useUiStore.toast`。
- Produces: `useNotesStore`：state `notes: Note[]`、`selectedId: string | null`、`saving: 'idle' | 'pending' | 'saving'`；actions `load(): Promise<void>`、`select(id): Promise<void>`、`create(): Promise<string>`、`edit(id, patch: Partial<Pick<Note,'title'|'content'>>): void`、`togglePin(id): Promise<void>`、`remove(id): Promise<void>`、`flush(): Promise<void>`。设置侧：`mergeNewDefaultModules(enabled: string[], merged: string[], modules: Array<{id: string; defaultEnabled: boolean}>): { enabled: string[]; merged: string[] } | null`。

- [ ] **Step 1: 写失败测试（store 自动保存）**

`src/stores/notes.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  noteList: vi.fn(async () => []),
  noteCreate: vi.fn(),
  noteUpdate: vi.fn(async (n: { updatedAt: string }) => ({ ...n, updatedAt: '2026-09-08T12:00:00' })),
  noteDelete: vi.fn(async () => {}),
}));

vi.mock('../lib/api', () => ({ api }));

import { useNotesStore } from './notes';

const N1 = {
  id: 'n1',
  title: '旧标题',
  content: '',
  pinned: false,
  createdAt: '2026-09-08T10:00:00',
  updatedAt: '2026-09-08T10:00:00',
};

describe('notes store 自动保存', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotesStore.setState({ notes: [], selectedId: null, saving: 'idle' });
    api.noteUpdate.mockClear();
  });

  it('编辑进入 pending，停顿 1 秒后自动保存并回到 idle', async () => {
    useNotesStore.setState({ notes: [{ ...N1 }], selectedId: 'n1' });

    useNotesStore.getState().edit('n1', { title: '新标题' });
    expect(useNotesStore.getState().saving).toBe('pending');

    await vi.advanceTimersByTimeAsync(1000);
    expect(api.noteUpdate).toHaveBeenCalledTimes(1);
    expect(api.noteUpdate.mock.calls[0][0].title).toBe('新标题');
    expect(useNotesStore.getState().saving).toBe('idle');
  });

  it('连续编辑只触发最后一次保存；切换选中前先 flush', async () => {
    useNotesStore.setState({
      notes: [{ ...N1 }, { ...N1, id: 'n2', updatedAt: '2026-09-08T11:00:00' }],
      selectedId: 'n1',
    });

    useNotesStore.getState().edit('n1', { title: '第一次' });
    await vi.advanceTimersByTimeAsync(600);
    useNotesStore.getState().edit('n1', { title: '第二次' });
    await useNotesStore.getState().select('n2');

    expect(api.noteUpdate).toHaveBeenCalledTimes(1);
    expect(api.noteUpdate.mock.calls[0][0].title).toBe('第二次');
    expect(useNotesStore.getState().selectedId).toBe('n2');
  });

  it('删除后自动选中列表第一条', async () => {
    useNotesStore.setState({
      notes: [{ ...N1 }, { ...N1, id: 'n2', updatedAt: '2026-09-08T11:00:00' }],
      selectedId: 'n1',
    });

    await useNotesStore.getState().remove('n1');

    expect(api.noteDelete).toHaveBeenCalledWith('n1');
    expect(useNotesStore.getState().selectedId).toBe('n2');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/stores/notes.test.ts`
Expected: FAIL（stores/notes.ts 不存在）。

- [ ] **Step 3: 实现 store**

`src/stores/notes.ts`：

```typescript
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Note } from '../types';
import { sortNotes } from '../features/notes/notes';
import { useUiStore } from './ui';

const AUTOSAVE_DELAY_MS = 1000;

interface NotesState {
  notes: Note[];
  selectedId: string | null;
  saving: 'idle' | 'pending' | 'saving';
  load: () => Promise<void>;
  select: (id: string) => Promise<void>;
  create: () => Promise<string>;
  edit: (id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) => void;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  flush: () => Promise<void>;
}

// 防抖计时器与待保存笔记 id 存在模块级（单实例应用，无需放 state）。
let timer: ReturnType<typeof setTimeout> | null = null;
let dirtyId: string | null = null;

function cancelPending() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const id = dirtyId;
  dirtyId = null;
  return id;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  selectedId: null,
  saving: 'idle',

  load: async () => {
    try {
      const notes = await api.noteList();
      set((s) => ({
        notes,
        selectedId:
          s.selectedId && notes.some((n) => n.id === s.selectedId)
            ? s.selectedId
            : notes[0]?.id ?? null,
      }));
    } catch (e) {
      useUiStore.getState().toast(`加载笔记失败：${e}`, 'error');
    }
  },

  select: async (id) => {
    await get().flush();
    set({ selectedId: id });
  },

  create: async () => {
    await get().flush();
    try {
      const n = await api.noteCreate({ title: '', content: '' });
      set((s) => ({ notes: sortNotes([n, ...s.notes]), selectedId: n.id }));
      return n.id;
    } catch (e) {
      useUiStore.getState().toast(`新建笔记失败：${e}`, 'error');
      throw e;
    }
  },

  edit: (id, patch) => {
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      saving: 'pending',
    }));
    dirtyId = id;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void get().flush();
    }, AUTOSAVE_DELAY_MS);
  },

  flush: async () => {
    const id = cancelPending();
    if (!id) return;
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    set({ saving: 'saving' });
    try {
      const saved = await api.noteUpdate(note);
      set((s) => ({
        notes: sortNotes(s.notes.map((n) => (n.id === saved.id ? saved : n))),
        saving: 'idle',
      }));
    } catch (e) {
      set({ saving: 'idle' });
      useUiStore.getState().toast(`保存笔记失败：${e}`, 'error');
    }
  },

  togglePin: async (id) => {
    await get().flush();
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    const next = { ...note, pinned: !note.pinned };
    set((s) => ({ notes: sortNotes(s.notes.map((n) => (n.id === id ? next : n))) }));
    try {
      const saved = await api.noteUpdate(next);
      set((s) => ({ notes: sortNotes(s.notes.map((n) => (n.id === saved.id ? saved : n))) }));
    } catch (e) {
      useUiStore.getState().toast(`置顶失败：${e}`, 'error');
      set((s) => ({ notes: sortNotes(s.notes.map((n) => (n.id === id ? note : n))) }));
    }
  },

  remove: async (id) => {
    if (dirtyId === id) cancelPending();
    try {
      await api.noteDelete(id);
    } catch (e) {
      useUiStore.getState().toast(`删除笔记失败：${e}`, 'error');
      return;
    }
    set((s) => {
      const notes = s.notes.filter((n) => n.id !== id);
      return {
        notes,
        selectedId: s.selectedId === id ? notes[0]?.id ?? null : s.selectedId,
      };
    });
  },
}));
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/stores/notes.test.ts`
Expected: PASS（fakeTimers 下 `advanceTimersByTimeAsync` 触发 setTimeout，微任务正常执行；`afterEach` 中可加 `vi.useRealTimers()`）。

- [ ] **Step 5: 设置合并——写失败测试**

`src/stores/settings.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { mergeNewDefaultModules } from './settings';

const MODULES = [
  { id: 'tasks', defaultEnabled: true },
  { id: 'calendar', defaultEnabled: true },
  { id: 'notes', defaultEnabled: true },
];

describe('mergeNewDefaultModules', () => {
  it('老用户首次升级：未记录过的默认模块并入并打标', () => {
    const r = mergeNewDefaultModules(['tasks', 'calendar'], [], MODULES);
    expect(r).toEqual({ enabled: ['tasks', 'calendar', 'notes'], merged: ['notes'] });
  });

  it('已合并过则返回 null（不重复启用用户禁用的模块）', () => {
    const r = mergeNewDefaultModules(['tasks'], ['notes', 'calendar'], MODULES);
    expect(r).toBeNull();
  });

  it('无默认模块可合并时返回 null', () => {
    const r = mergeNewDefaultModules(['tasks'], ['notes', 'calendar'], [
      { id: 'tasks', defaultEnabled: true },
    ]);
    expect(r).toBeNull();
  });
});
```

Run: `npx vitest run src/stores/settings.test.ts`
Expected: FAIL（函数不存在）。

- [ ] **Step 6: 实现合并逻辑**

`src/stores/settings.ts`：在 `useSettingsStore` 之前导出纯函数：

```typescript
/** 把尚未向用户展示过的默认启用模块并入 enabled 并打标；无变化返回 null。 */
export function mergeNewDefaultModules(
  enabled: string[],
  merged: string[],
  modules: Array<{ id: string; defaultEnabled: boolean }>,
): { enabled: string[]; merged: string[] } | null {
  const toMerge = modules.filter((m) => m.defaultEnabled && !merged.includes(m.id));
  if (toMerge.length === 0) return null;
  return {
    enabled: Array.from(new Set([...enabled, ...toMerge.map((m) => m.id)])),
    merged: Array.from(new Set([...merged, ...toMerge.map((m) => m.id)])),
  };
}
```

`load` 改为：

```typescript
  load: async () => {
    try {
      const all = await api.settingsAll();
      const stored = all.enabledModules
        ? (JSON.parse(all.enabledModules) as string[])
        : undefined;
      const merged: string[] = all.mergedDefaultModules
        ? (JSON.parse(all.mergedDefaultModules) as string[])
        : [];
      const enabled = stored ?? get().enabledModules;
      const result = mergeNewDefaultModules(enabled, merged, MODULES);
      if (result) {
        await api.settingsSet('enabledModules', JSON.stringify(result.enabled));
        await api.settingsSet('mergedDefaultModules', JSON.stringify(result.merged));
      }
      set({ enabledModules: result?.enabled ?? enabled, theme: (all.theme as ThemeMode) || 'system' });
    } catch (e) {
      useUiStore.getState().toast(`加载设置失败：${e}`, 'error');
    }
  },
```

- [ ] **Step 7: 运行确认通过并提交**

Run: `npx vitest run src/stores/settings.test.ts src/stores/notes.test.ts`
Expected: PASS。

```bash
git add src/stores/notes.ts src/stores/notes.test.ts src/stores/settings.ts src/stores/settings.test.ts
git commit --no-verify -m "feat: 笔记 store（1 秒防抖自动保存）与新增默认模块合并"
```

---

### Task 8: NotesPage + registry 注册 + 样式

**Files:**
- Create: `src/features/notes/NotesPage.tsx`
- Modify: `src/modules/registry.ts`
- Modify: `src/modules/registry.test.ts:5-7`
- Modify: `src/index.css`（文件末尾追加）

**Interfaces:**
- Consumes: Task 6 纯函数、Task 7 store、Task 5 `timeShort`。

- [ ] **Step 1: 更新 registry 及其测试**

`src/modules/registry.ts`：

```typescript
import type { Module } from './types';
import KanbanPage from '../features/tasks/KanbanPage';
import CalendarPage from '../features/calendar/CalendarPage';
import NotesPage from '../features/notes/NotesPage';

export const MODULES: Module[] = [
  {
    id: 'tasks',
    name: '任务看板',
    icon: '▦',
    description: '三列拖拽任务管理',
    defaultEnabled: true,
    route: '/tasks',
    component: KanbanPage,
  },
  {
    id: 'calendar',
    name: '日历',
    icon: '▤',
    description: '月历与当日日程',
    defaultEnabled: true,
    route: '/calendar',
    component: CalendarPage,
  },
  {
    id: 'notes',
    name: '笔记',
    icon: '✎',
    description: '纯文本快速记录',
    defaultEnabled: true,
    route: '/notes',
    component: NotesPage,
  },
];

export function enabledModules(enabledIds: string[]): Module[] {
  return MODULES.filter((m) => enabledIds.includes(m.id));
}
```

`src/modules/registry.test.ts` 第一个用例改为：

```typescript
  it('包含任务看板、日历、笔记三个内置模块', () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual(['calendar', 'notes', 'tasks']);
  });
```

- [ ] **Step 2: 实现 NotesPage**

`src/features/notes/NotesPage.tsx`：

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Note } from '../../types';
import { timeShort } from '../../lib/format';
import { noteExcerpt, searchNotes, splitPinned } from './notes';
import { useNotesStore } from '../../stores/notes';

export default function NotesPage() {
  const notes = useNotesStore((s) => s.notes);
  const selectedId = useNotesStore((s) => s.selectedId);
  const saving = useNotesStore((s) => s.saving);
  const load = useNotesStore((s) => s.load);
  const select = useNotesStore((s) => s.select);
  const create = useNotesStore((s) => s.create);
  const edit = useNotesStore((s) => s.edit);
  const togglePin = useNotesStore((s) => s.togglePin);
  const remove = useNotesStore((s) => s.remove);

  const [keyword, setKeyword] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const current = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    void load();
  }, [load]);

  // 卸载前把未保存的编辑落库（页面切换时 App 直接卸载本组件）。
  useEffect(() => {
    return () => void useNotesStore.getState().flush();
  }, []);

  const visible = useMemo(() => searchNotes(notes, keyword), [notes, keyword]);
  const [pinned, rest] = useMemo(() => splitPinned(visible), [visible]);

  async function handleCreate() {
    await create();
    titleRef.current?.focus();
  }

  async function handleDelete() {
    if (!current) return;
    const ok = await confirm('删除这篇笔记？', { title: '删除笔记' });
    if (!ok) return;
    await remove(current.id);
  }

  return (
    <div className="notes-layout">
      <aside className="panel notes-list">
        <div className="notes-list-tools">
          <input
            className="input"
            placeholder="搜索笔记…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button className="btn primary" style={{ flex: 'none' }} onClick={() => void handleCreate()}>
            ＋
          </button>
        </div>
        <div className="notes-items">
          {pinned.length > 0 && <div className="notes-group-label">置顶</div>}
          {pinned.map((n) => (
            <NoteRow key={n.id} note={n} active={n.id === selectedId} onSelect={() => void select(n.id)} />
          ))}
          {rest.length > 0 && pinned.length > 0 && <div className="notes-group-label">全部</div>}
          {rest.map((n) => (
            <NoteRow key={n.id} note={n} active={n.id === selectedId} onSelect={() => void select(n.id)} />
          ))}
          {visible.length === 0 && (
            <div className="day-empty">{keyword ? '没有匹配的笔记' : '还没有笔记'}</div>
          )}
        </div>
      </aside>
      <section className="panel notes-editor">
        {current ? (
          <>
            <div className="notes-editor-head">
              <input
                ref={titleRef}
                className="notes-title-input"
                placeholder="无标题"
                value={current.title}
                onChange={(e) => edit(current.id, { title: e.target.value })}
              />
              <button
                className="btn"
                title={current.pinned ? '取消置顶' : '置顶'}
                onClick={() => void togglePin(current.id)}
              >
                {current.pinned ? '已置顶' : '置顶'}
              </button>
              <button className="btn danger" onClick={() => void handleDelete()}>
                删除
              </button>
            </div>
            <textarea
              className="notes-content"
              placeholder="写点什么…"
              value={current.content}
              onChange={(e) => edit(current.id, { content: e.target.value })}
            />
            <div className="notes-status">{saving === 'idle' ? '已保存' : '保存中…'}</div>
          </>
        ) : (
          <div className="notes-empty">
            <div>
              <p>{notes.length === 0 ? '还没有笔记，随手记点东西吧' : '选择左侧笔记，或新建一篇'}</p>
              <button className="btn primary" onClick={() => void handleCreate()}>
                新建第一篇笔记
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function NoteRow({ note, active, onSelect }: { note: Note; active: boolean; onSelect: () => void }) {
  return (
    <button className={`note-item${active ? ' active' : ''}`} onClick={onSelect}>
      <span className={`note-item-title${note.title ? '' : ' blank'}`}>
        {note.pinned && <span className="pin">📌 </span>}
        {note.title || '无标题'}
      </span>
      <span className="note-item-meta">
        <span>{noteExcerpt(note.content) || '（空）'}</span>
        <span>{timeShort(note.updatedAt)}</span>
      </span>
    </button>
  );
}
```

- [ ] **Step 3: 追加样式**

`src/index.css` 末尾追加：

```css
/* 笔记双栏 */
.notes-layout { display: grid; grid-template-columns: 280px 1fr; gap: 16px; height: 100%; min-height: 0; }
.notes-list { display: flex; flex-direction: column; gap: 8px; padding: 12px; min-height: 0; }
.notes-list-tools { display: flex; gap: 8px; }
.notes-items { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; min-height: 0; }
.notes-group-label { font-size: 11px; color: var(--muted); padding: 8px 6px 2px; }
.note-item {
  text-align: left; background: none; border: none; border-radius: 8px;
  padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; min-width: 0;
}
.note-item:hover { background: var(--bg); }
.note-item.active { background: var(--bg); box-shadow: inset 0 0 0 1px var(--accent); }
.note-item-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note-item-title.blank { color: var(--muted); font-weight: 400; }
.note-item-title .pin { color: var(--warn); }
.note-item-meta { font-size: 12px; color: var(--muted); display: flex; gap: 6px; min-width: 0; }
.note-item-meta span:first-child { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.notes-editor { display: flex; flex-direction: column; gap: 10px; padding: 16px; min-height: 0; }
.notes-editor-head { display: flex; gap: 8px; align-items: center; }
.notes-title-input {
  font-size: 16px; font-weight: 600; border: none; background: none;
  outline: none; padding: 4px 6px; flex: 1; min-width: 0;
}
.notes-content {
  flex: 1; resize: none; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); padding: 10px 12px; outline: none; line-height: 1.7;
  user-select: text;
}
.notes-content:focus { border-color: var(--accent); }
.notes-title-input { user-select: text; }
.notes-status { align-self: flex-end; font-size: 12px; color: var(--muted); }
.notes-empty { display: grid; place-items: center; height: 100%; color: var(--muted); text-align: center; }
```

- [ ] **Step 4: 全量前端测试**

Run: `npx vitest run`
Expected: 全部 PASS（含更新后的 registry.test.ts）。

- [ ] **Step 5: 提交**

```bash
git add src/features/notes/NotesPage.tsx src/modules/registry.ts src/modules/registry.test.ts src/index.css
git commit --no-verify -m "feat: 笔记模块页面（双栏、搜索、置顶、自动保存）并注册"
```

---

### Task 9: README 更新 + 全量验证

**Files:**
- Modify: `README.md`

**Interfaces:** 无代码接口；文档与验收。

- [ ] **Step 1: 更新 README**

1. 第 3 行简介改为：

```markdown
Windows 桌面个人工作台：任务看板 + 日历日程 + 笔记，模块化架构，数据全本地。
```

2. 功能清单（第 7-13 行）在「日历」条目后插入一行：

```markdown
- **笔记**：纯文本双栏编辑，关键字搜索，置顶，停止输入 1 秒自动保存。
```

3. 「日历」条目中「任务=优先级色，日程=蓝」改为「任务=优先级色」（events 已并入 tasks）。

4. 第 27 行技术栈 `React 18` 改为 `React 19`，并在 `date-fns` 后加 `solarlunar`：

```markdown
Tauri 2 · React 19 · TypeScript · Zustand · dnd-kit · date-fns · solarlunar · rusqlite · Vitest
```

5. 设计文档列表（第 29-30 行）追加一行：

```markdown
笔记模块设计：`docs/superpowers/specs/2026-09-08-notes-module-design.md`
```

- [ ] **Step 2: 全量测试**

Run: `npx vitest run && cd src-tauri && cargo test`
Expected: 前后端全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit --no-verify -m "docs: README 补充笔记模块并修正 React 版本描述"
```

- [ ] **Step 4: 手工冒烟（需要用户配合或运行 dev）**

Run: `npm run tauri dev`

验证清单：
1. 侧边栏出现「笔记」且默认启用；设置页模块管理中出现可开关的「笔记」。
2. 新建笔记 → 输入标题与内容，停顿 1 秒后右下角「保存中…→已保存」。
3. 搜索关键字过滤；清空恢复。
4. 置顶后笔记跳到「置顶」分组；取消置顶回「全部」。
5. 删除有确认弹窗；删除后自动选中下一篇。
6. 重启应用（或重启 dev）数据保留。
7. 浅色/深色主题下样式正常。
8. 任务看板、日历、快速面板、备份导出导入不受影响。

---

## Self-Review 记录

- **Spec 覆盖**：迁移 v4（Task 1）、Note 模型/查询（Task 2）、CRUD command（Task 3）、备份 v4 兼容（Task 4）、类型/API/时间格式（Task 5）、纯函数（Task 6）、store 自动保存 + 老用户默认启用合并（Task 7）、页面/注册/样式（Task 8）、文档与验收（Task 9）。设计文档 §3.5 的「升级后直接可见」由 Task 7 Step 5-6 的合并逻辑保证。
- **占位符**：无 TBD/TODO；所有步骤含完整代码与预期输出。
- **类型一致性**：`Note`/`NoteInput` 前后端字段一一对应（serde camelCase）；`sortNotes` 在 Task 6 定义、Task 7 使用；`mergeNewDefaultModules` 签名在 Task 7 测试与实现一致；`timeShort(iso, now?)` 与测试调用一致。
