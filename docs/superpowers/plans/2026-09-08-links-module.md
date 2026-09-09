# 快捷入口模块（MyDesk v0.3）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「快捷入口」模块：网址/文件/命令三类条目，网格卡片 + 搜索 + 弹窗编辑 + 拖拽排序，系统默认程序打开，数据入 SQLite（迁移 v5），备份 v5 兼容。

**Architecture:** 完全复用笔记模块迭代的既有分层——Rust：db.rs 版本化迁移 + models.rs 行映射 + commands.rs with_conn；前端：registry 注册 + Zustand store + 纯函数（搜索/排序/校验）单测 + dnd-kit 网格拖拽。设计文档：`docs/superpowers/specs/2026-09-08-links-module-design.md`。

**Tech Stack:** Tauri 2 (rusqlite/chrono/uuid/tauri-plugin-opener) · React 19 · TypeScript · Zustand 5 · @dnd-kit/core · Vitest 5。

## Global Constraints

- UI 文案全部简体中文；代码标识符英文。
- serde 一律 `#[serde(rename_all = "camelCase")]`。
- `PRAGMA user_version` 收敛到 **5**；旧库路径（0–4）迁移后数据零丢失。
- 备份 `VERSION = 5`；导入接受 `version <= 5`；校验失败零写入。
- 时间戳 `%Y-%m-%dT%H:%M:%S`（`commands::now_iso`）。
- kind 取值恒为 `'url' | 'path' | 'command'`；前端 `normalizeTarget` 对 url 补 `https://`。
- command 执行仅经 `cmd /C` spawn，不等待退出；编辑表单明示警示。
- 测试命令：`npx vitest run`；`cd src-tauri && cargo test`。
- 提交信息中文，前缀 `feat:`/`test:`/`docs:`/`chore:`，`--no-verify`。
- 不引入任何新依赖（opener/dnd-kit 均已就位）。

---

### Task 1: db.rs 迁移 v4→v5（links 表）

**Files:**
- Modify: `src-tauri/src/db.rs`

**Interfaces:**
- Produces: `SCHEMA_V5: &str`、`MIGRATE_V5: &str`（仅 links 建表）、`upgrade_to_v5(conn) -> rusqlite::Result<()>`；`migrate()` 收敛 `user_version = 5`；`SCHEMA_V4: &str`（测试构造 v4 库用）。

- [ ] **Step 1: 写失败测试**

`db.rs` 测试模块：`fresh_db_creates_all_tables_at_v4` 改名为 `fresh_db_creates_all_tables_at_v5`，断言表数 `3`→`4`（IN 列表加 `'links'`）、version `4`→`5`、加 `assert!(column_exists(&c, "links", "target").unwrap());`；`v1_db_migrates_events_into_tasks_then_v4`、`v2_db_upgrades_to_v4`、`v3_db_upgrades_to_v4_keeps_tasks` 的函数名与 `assert_eq!(v, 4)` 全部 `4`→`5`；追加：

```rust
    #[test]
    fn v4_db_upgrades_to_v5_keeps_data() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V4).unwrap();
        c.execute_batch("PRAGMA user_version = 4;").unwrap();
        c.execute(
            "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, created_at, updated_at) VALUES ('t1', 'default', '旧任务', '', 'todo', 1, NULL, 100.0, NULL, 0, '2026-09-08T10:00:00', '2026-09-08T10:00:00')",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO notes (id, title, content, pinned, created_at, updated_at) VALUES ('n1', '旧笔记', '', 0, '2026-09-08T10:00:00', '2026-09-08T10:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 5);
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get::<_, i64>(0)).unwrap(),
            1
        );
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get::<_, i64>(0)).unwrap(),
            1
        );
        assert!(table_exists(&c, "links").unwrap());
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test db::tests`
Expected: FAIL（version 仍为 4 / links 表不存在）。

- [ ] **Step 3: 最小实现**

`db.rs`：

```rust
/// v5 建表语句（新库直接为此形态）：tasks + notes + links。
pub const SCHEMA_V5: &str = "
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
CREATE TABLE IF NOT EXISTS links (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'url',
  target     TEXT NOT NULL,
  sort_order REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v4→v5：新增 links 表。
pub const MIGRATE_V5: &str = "
CREATE TABLE IF NOT EXISTS links (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'url',
  target     TEXT NOT NULL,
  sort_order REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
";

/// v4 建表语句，仅用于迁移测试中构造 v4 库。
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
```

`SCHEMA_V4` 文档注释标记「仅测试用」。`migrate()`：所有 `SCHEMA_V4`/`4` 改为 `SCHEMA_V5`/`5`（全新库分支 `conn.execute_batch(SCHEMA_V5)?; conn.pragma_update(None, "user_version", 5)?; return Ok(());`），末尾统一 `upgrade_to_v5(conn)?; conn.pragma_update(None, "user_version", 5)?;`，并加：

```rust
fn upgrade_to_v5(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "links")? {
        conn.execute_batch(MIGRATE_V5)?;
    }
    Ok(())
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test db::tests`
Expected: 全部 PASS（含幂等）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/db.rs
git commit --no-verify -m "feat: 数据库迁移 v5——新增 links 表"
```

---

### Task 2: models.rs 的 Link 模型

**Files:**
- Modify: `src-tauri/src/models.rs`

**Interfaces:**
- Produces: `Link { id, title, kind, target: String, sort_order: f64, created_at, updated_at }`（camelCase）、`LinkInput { title, kind: String, target }`（kind 默认 `"url"`）、`LINK_COLS`/`LINK_INSERT`/`link_from_row`/`query_all_links`（`ORDER BY sort_order`）。

- [ ] **Step 1: 写失败测试**

`models.rs` 测试模块追加：

```rust
    #[test]
    fn link_roundtrip_via_row_mapping() {
        let c = mem();
        c.execute(
            LINK_INSERT,
            params!["l1", "Gmail", "url", "https://mail.google.com", 100.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"],
        )
        .unwrap();
        let got = query_all_links(&c).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "l1");
        assert_eq!(got[0].title, "Gmail");
        assert_eq!(got[0].kind, "url");
        assert_eq!(got[0].target, "https://mail.google.com");
        assert_eq!(got[0].sort_order, 100.0);
    }

    #[test]
    fn links_order_by_sort_order() {
        let c = mem();
        c.execute(LINK_INSERT, params!["b", "第二", "url", "https://b.example.com", 200.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"]).unwrap();
        c.execute(LINK_INSERT, params!["a", "第一", "path", "C:\\dir", 100.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"]).unwrap();
        let got = query_all_links(&c).unwrap();
        let ids: Vec<&str> = got.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "b"]);
    }

    #[test]
    fn link_input_defaults() {
        let json = r#"{"title":"文档","target":"C:\\doc"}"#;
        let input: LinkInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.kind, "url");
        assert_eq!(input.target, "C:\\doc");
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test models::tests`
Expected: FAIL（LINK_INSERT 未定义，编译错误）。

- [ ] **Step 3: 最小实现**

`models.rs` 常量区追加：

```rust
pub const LINK_COLS: &str = "id, title, kind, target, sort_order, created_at, updated_at";
pub const LINK_INSERT: &str =
    "INSERT INTO links (id, title, kind, target, sort_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)";
```

类型区（Note 之后）追加：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub target: String,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInput {
    pub title: String,
    #[serde(default = "dft_kind")]
    pub kind: String,
    pub target: String,
}

fn dft_kind() -> String {
    "url".into()
}
```

查询区（query_all_notes 之后）追加：

```rust
pub fn link_from_row(r: &Row) -> rusqlite::Result<Link> {
    Ok(Link {
        id: r.get(0)?,
        title: r.get(1)?,
        kind: r.get(2)?,
        target: r.get(3)?,
        sort_order: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

pub fn query_all_links(c: &Connection) -> rusqlite::Result<Vec<Link>> {
    let mut stmt = c.prepare(&format!("SELECT {LINK_COLS} FROM links ORDER BY sort_order"))?;
    let rows = stmt.query_map([], link_from_row)?;
    rows.collect()
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test models::tests`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/models.rs
git commit --no-verify -m "feat: Link 数据模型与排序查询"
```

---

### Task 3: commands.rs 六个 link command + lib.rs 注册

**Files:**
- Modify: `src-tauri/src/commands.rs`（note_delete 之后追加）
- Modify: `src-tauri/src/lib.rs`（generate_handler 追加 6 行）

**Interfaces:**
- Produces: `link_list() -> Vec<Link>`、`link_create(input: LinkInput) -> Link`（sort_order = MAX+100）、`link_update(link: Link) -> Link`、`link_delete(id)`、`link_move(id: String, sortOrder: f64) -> ()`、`link_run(id: String) -> ()`（cmd /C spawn，不等待）。

- [ ] **Step 1: 实现 command**

`commands.rs` 追加：

```rust
#[tauri::command]
pub fn link_list(db: DbState) -> Result<Vec<Link>, String> {
    with_conn(db, query_all_links)
}

#[tauri::command]
pub fn link_create(db: DbState, input: LinkInput) -> Result<Link, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let max: f64 = c.query_row("SELECT COALESCE(MAX(sort_order), 0) FROM links", [], |r| r.get(0))?;
        let l = Link {
            id: Uuid::new_v4().to_string(),
            title: input.title,
            kind: input.kind,
            target: input.target,
            sort_order: max + 100.0,
            created_at: now.clone(),
            updated_at: now,
        };
        c.execute(
            LINK_INSERT,
            params![l.id, l.title, l.kind, l.target, l.sort_order, l.created_at, l.updated_at],
        )?;
        Ok(l)
    })
}

#[tauri::command]
pub fn link_update(db: DbState, link: Link) -> Result<Link, String> {
    with_conn(db, move |c| {
        let now = now_iso();
        c.execute(
            "UPDATE links SET title=?2, kind=?3, target=?4, updated_at=?5 WHERE id=?1",
            params![link.id, link.title, link.kind, link.target, now],
        )?;
        Ok(Link { updated_at: now, ..link })
    })
}

#[tauri::command]
pub fn link_delete(db: DbState, id: String) -> Result<(), String> {
    with_conn(db, move |c| {
        c.execute("DELETE FROM links WHERE id=?1", params![id])?;
        Ok(())
    })
}

#[tauri::command]
pub fn link_move(db: DbState, id: String, sort_order: f64) -> Result<(), String> {
    with_conn(db, move |c| {
        c.execute(
            "UPDATE links SET sort_order=?2, updated_at=?3 WHERE id=?1",
            params![id, sort_order, now_iso()],
        )?;
        Ok(())
    })
}

/// 仅 command 类型：本机执行用户自己配置的命令（单机个人应用，风险自担）。
#[tauri::command]
pub fn link_run(db: DbState, id: String) -> Result<(), String> {
    let target = with_conn(db, move |c| {
        let (kind, target): (String, String) = c
            .query_row("SELECT kind, target FROM links WHERE id=?1", params![id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        Ok(target) // kind 校验放下面，避免借用问题
    })?;
    // 上面 query_row 已取 target；kind 一并校验：
    // 简化：直接执行 target（只有 command 类型的前端会调用本 command）。
    std::process::Command::new("cmd")
        .args(["/C", &target])
        .spawn()
        .map_err(|e| format!("命令执行失败：{e}"))?;
    Ok(())
}
```

> 实现注：`link_run` 中 `with_conn` 闭包只需取 target；如借用报错，改为先 `let (kind, target) = with_conn(...)?;` 再 `if kind != "command" { return Err("仅命令类型可执行".into()); }` 并在 SQL 中同时取 kind——以编译通过且校验 kind 为准。

`lib.rs` generate_handler 追加：

```rust
            commands::link_list,
            commands::link_create,
            commands::link_update,
            commands::link_delete,
            commands::link_move,
            commands::link_run,
```

- [ ] **Step 2: 运行全量后端测试**

Run: `cd src-tauri && cargo test`
Expected: 编译通过，全部 PASS。

- [ ] **Step 3: 提交**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit --no-verify -m "feat: 快捷入口 CRUD/排序/执行 command 并注册"
```

---

### Task 4: backup.rs v5

**Files:**
- Modify: `src-tauri/src/backup.rs`

**Interfaces:**
- Consumes: `query_all_links` / `LINK_INSERT`。
- Produces: `VERSION = 5`；导出含 `"links"`；导入兼容无 links 的 v1–v4 备份。

- [ ] **Step 1: 修改/新增测试**

1. `export_then_import_roundtrip` 与 `export_import_preserves_notes` 中 `assert_eq!(doc["version"], 4)` → `5`。
2. 追加：

```rust
    #[test]
    fn export_import_preserves_links() {
        let src = mem();
        src.execute(
            crate::models::LINK_INSERT,
            params!["l1", "Gmail", "url", "https://mail.google.com", 100.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"],
        )
        .unwrap();
        let file = std::env::temp_dir().join(format!("ws-bk-links-{}.json", std::process::id()));
        export(&src, &file).unwrap();

        let mut dst = mem();
        import(&mut dst, &file).unwrap();
        let links = crate::models::query_all_links(&dst).unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].title, "Gmail");
        assert_eq!(links[0].kind, "url");

        let text = std::fs::read_to_string(&file).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["version"], 5);
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_v4_backup_without_links_is_accepted() {
        let file = std::env::temp_dir().join(format!("ws-bk-v4nolinks-{}.json", std::process::id()));
        std::fs::write(
            &file,
            r#"{
              "version": 4,
              "tasks": [],
              "notes": [
                {"id":"n1","title":"旧笔记","content":"","pinned":false,"createdAt":"2026-09-08T10:00:00","updatedAt":"2026-09-08T10:00:00"}
              ],
              "settings": []
            }"#,
        )
        .unwrap();

        let mut c = mem();
        c.execute(crate::models::LINK_INSERT, params!["l-old", "将被清空", "url", "https://old.example.com", 100.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"]).unwrap();
        let n = import(&mut c, &file).unwrap();
        assert_eq!(n, 1);
        assert_eq!(crate::models::query_all_notes(&c).unwrap().len(), 1);
        assert_eq!(crate::models::query_all_links(&c).unwrap().len(), 0, "旧备份无 links，整库替换后为空");
        std::fs::remove_file(&file).ok();
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src-tauri && cargo test backup::tests`
Expected: `export_import_preserves_links` FAIL。

- [ ] **Step 3: 最小实现**

`backup.rs`：`VERSION = 5`；`export` 的 json! 增加 `"links": query_all_links(conn)?`；`import` 在 notes 解析后追加：

```rust
    let links: Vec<Link> = match doc.get("links") {
        Some(v) => serde_json::from_value(v.clone()).context("links 字段格式错误")?,
        None => Vec::new(),
    };
```

事务：`DELETE FROM links`；插入循环：

```rust
    for l in &links {
        tx.execute(
            LINK_INSERT,
            params![l.id, l.title, l.kind, l.target, l.sort_order, l.created_at, l.updated_at],
        )?;
    }
```

返回值 `+ links.len()`。

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/backup.rs
git commit --no-verify -m "feat: 备份格式 v5——含快捷入口导出导入并兼容旧版"
```

---

### Task 5: 前端类型 + API

**Files:**
- Modify: `src/types.ts`（Note 之后追加）
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces: `type LinkKind = 'url' | 'path' | 'command'`；`Link { id: string; title: string; kind: LinkKind; target: string; sortOrder: number; createdAt: string; updatedAt: string }`；`LinkInput { title: string; kind: LinkKind; target: string }`；`api.linkList(): Promise<Link[]>`、`api.linkCreate(input: LinkInput): Promise<Link>`、`api.linkUpdate(link: Link): Promise<Link>`、`api.linkDelete(id: string): Promise<void>`、`api.linkMove(id: string, sortOrder: number): Promise<void>`、`api.linkRun(id: string): Promise<void>`。

- [ ] **Step 1: 实现（本任务为纯类型与封装，由 Task 6 的测试与 tsc 验证）**

`src/types.ts` 追加：

```typescript
export type LinkKind = 'url' | 'path' | 'command';

export interface Link {
  id: string;
  title: string;
  kind: LinkKind;
  target: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinkInput {
  title: string;
  kind: LinkKind;
  target: string;
}
```

`src/lib/api.ts` 对象内追加（import 类型行加 `Link, LinkInput, LinkKind` 所需的 `Link, LinkInput`）：

```typescript
  linkList: () => invoke<Link[]>('link_list'),
  linkCreate: (input: LinkInput) => invoke<Link>('link_create', { input }),
  linkUpdate: (link: Link) => invoke<Link>('link_update', { link }),
  linkDelete: (id: string) => invoke<void>('link_delete', { id }),
  linkMove: (id: string, sortOrder: number) => invoke<void>('link_move', { id, sortOrder }),
  linkRun: (id: string) => invoke<void>('link_run', { id }),
```

注意：`link_move` 的 Rust 参数名是 `sort_order`（snake_case），Tauri 2 会把 camelCase 参数 `sortOrder` 自动映射为 snake_case（与 `remindMinutesBefore` 同理），无需转换。

- [ ] **Step 2: 验证**

Run: `npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 3: 提交**

```bash
git add src/types.ts src/lib/api.ts
git commit --no-verify -m "feat: Link 类型与 API 封装"
```

---

### Task 6: links.ts 纯函数（TDD）

**Files:**
- Create: `src/features/links/links.ts`
- Test: `src/features/links/links.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `Link`/`LinkKind`。
- Produces: `searchLinks(links: Link[], keyword: string): Link[]`；`applyLinkMove(links: Link[], id: string, targetIndex: number): { next: Link[]; sortOrder: number } | null`（中点算法，null=位置无变化）；`kindIcon(kind: LinkKind): string`；`normalizeTarget(kind: LinkKind, raw: string): string`；`validateTarget(kind: LinkKind, raw: string): string | null`。

- [ ] **Step 1: 写失败测试**

`src/features/links/links.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import type { Link } from '../../types';
import { applyLinkMove, kindIcon, normalizeTarget, searchLinks, validateTarget } from './links';

function link(partial: Partial<Link>): Link {
  return {
    id: 'x',
    title: '',
    kind: 'url',
    target: '',
    sortOrder: 100,
    createdAt: '2026-09-08T10:00:00',
    updatedAt: '2026-09-08T10:00:00',
    ...partial,
  };
}

describe('searchLinks', () => {
  const links = [
    link({ id: '1', title: 'Gmail', target: 'https://mail.google.com' }),
    link({ id: '2', title: '素材', kind: 'path', target: 'D:\\assets' }),
  ];

  it('空关键字返回全部', () => {
    expect(searchLinks(links, '  ')).toHaveLength(2);
  });

  it('匹配标题或目标，不区分大小写', () => {
    expect(searchLinks(links, 'gmail').map((l) => l.id)).toEqual(['1']);
    expect(searchLinks(links, 'assets').map((l) => l.id)).toEqual(['2']);
    expect(searchLinks(links, 'github')).toHaveLength(0);
  });
});

describe('applyLinkMove', () => {
  const links = [
    link({ id: 'a', sortOrder: 100 }),
    link({ id: 'b', sortOrder: 200 }),
    link({ id: 'c', sortOrder: 300 }),
  ];

  it('移到中间取前后中点', () => {
    const r = applyLinkMove(links, 'c', 1);
    expect(r).not.toBeNull();
    expect(r!.sortOrder).toBe(150);
    expect(r!.next.map((l) => l.id)).toEqual(['a', 'c', 'b']);
  });

  it('移到首位取 0.5，移到末尾取 MAX+100，位置不变返回 null', () => {
    expect(applyLinkMove(links, 'a', 0)!.sortOrder).toBe(50);
    expect(applyLinkMove(links, 'a', 2)!.sortOrder).toBe(400);
    expect(applyLinkMove(links, 'a', 0)).toBeNull(); // 已在首位
  });
});

describe('kindIcon', () => {
  it('三类图标', () => {
    expect(kindIcon('url')).toBe('🌐');
    expect(kindIcon('path')).toBe('📁');
    expect(kindIcon('command')).toBe('⚡');
  });
});

describe('normalizeTarget', () => {
  it('url 无协议头补 https://，其余 trim', () => {
    expect(normalizeTarget('url', 'gmail.com')).toBe('https://gmail.com');
    expect(normalizeTarget('url', 'https://a.com')).toBe('https://a.com');
    expect(normalizeTarget('path', ' D:\\dir ')).toBe('D:\\dir');
    expect(normalizeTarget('command', ' npm run build ')).toBe('npm run build');
  });
});

describe('validateTarget', () => {
  it('空目标报错', () => {
    expect(validateTarget('url', '   ')).toContain('不能为空');
  });

  it('url 校验协议头', () => {
    expect(validateTarget('url', 'https://a.com')).toBeNull();
    expect(validateTarget('url', 'ftp://a.com')).toContain('http');
  });

  it('path/command 非空即可', () => {
    expect(validateTarget('path', 'D:\\x')).toBeNull();
    expect(validateTarget('command', 'npm run build')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/features/links/links.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 最小实现**

`src/features/links/links.ts`：

```typescript
import type { Link, LinkKind } from '../../types';

/** 标题+目标不区分大小写包含匹配；关键字为空白时返回全部。 */
export function searchLinks(links: Link[], keyword: string): Link[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return links;
  return links.filter(
    (l) => l.title.toLowerCase().includes(k) || l.target.toLowerCase().includes(k),
  );
}

/**
 * 网格拖拽排序（中点算法，与任务看板一致）。
 * 返回重排后的新数组与被移动条目的新 sort_order；位置无变化返回 null。
 */
export function applyLinkMove(
  links: Link[],
  id: string,
  targetIndex: number,
): { next: Link[]; sortOrder: number } | null {
  const moving = links.find((l) => l.id === id);
  if (!moving) return null;
  const rest = links.filter((l) => l.id !== id);
  const idx = Math.max(0, Math.min(targetIndex, rest.length));
  if (links[idx] === moving && idx !== rest.length) return null;
  const prev = idx > 0 ? rest[idx - 1].sortOrder : null;
  const next = idx < rest.length ? rest[idx].sortOrder : null;
  const sortOrder =
    prev !== null && next !== null ? (prev + next) / 2 : prev !== null ? prev + 100 : next !== null ? next / 2 : 100;
  const next2 = [...rest];
  next2.splice(idx, 0, moving);
  return { next: next2, sortOrder };
}

/** 卡片图标。 */
export function kindIcon(kind: LinkKind): string {
  return kind === 'url' ? '🌐' : kind === 'path' ? '📁' : '⚡';
}

/** url 无协议头自动补 https://；其余 trim。 */
export function normalizeTarget(kind: LinkKind, raw: string): string {
  const t = raw.trim();
  if (kind !== 'url') return t;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}

/** 保存前校验；null=合法，否则为错误提示。 */
export function validateTarget(kind: LinkKind, raw: string): string | null {
  const t = raw.trim();
  if (!t) return '目标不能为空';
  if (kind === 'url' && !/^https?:\/\//i.test(normalizeTarget('url', t))) {
    return '网址需以 http(s):// 开头';
  }
  return null;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/features/links/links.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/links/
git commit --no-verify -m "feat: 快捷入口搜索/拖拽排序/校验纯函数"
```

---

### Task 7: stores/links.ts（TDD）

**Files:**
- Create: `src/stores/links.ts`
- Test: `src/stores/links.test.ts`

**Interfaces:**
- Consumes: Task 5 `api.link*`、Task 6 `applyLinkMove`、`useUiStore.toast`、`openUrl/openPath`（@tauri-apps/plugin-opener，测试中 mock）。
- Produces: `useLinksStore`：state `links: Link[]`；actions `load(): Promise<void>`、`create(input: LinkInput): Promise<void>`、`update(link: Link): Promise<void>`、`remove(id: string): Promise<void>`、`move(id: string, targetIndex: number): Promise<void>`（乐观更新+失败回滚）、`open(link: Link): Promise<void>`。

- [ ] **Step 1: 写失败测试**

`src/stores/links.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  linkList: vi.fn(async () => []),
  linkCreate: vi.fn(),
  linkUpdate: vi.fn(async (l: Record<string, unknown>) => l),
  linkDelete: vi.fn(async () => {}),
  linkMove: vi.fn(async () => {}),
  linkRun: vi.fn(async () => {}),
}));

const opener = vi.hoisted(() => ({
  openUrl: vi.fn(async () => {}),
  openPath: vi.fn(async () => {}),
}));

vi.mock('../lib/api', () => ({ api }));
vi.mock('@tauri-apps/plugin-opener', () => opener);

import { useLinksStore } from './links';

const L = (p: Partial<import('../types').Link>) => ({
  id: 'x',
  title: '',
  kind: 'url' as const,
  target: '',
  sortOrder: 100,
  createdAt: '2026-09-08T10:00:00',
  updatedAt: '2026-09-08T10:00:00',
  ...p,
});

describe('links store', () => {
  beforeEach(() => {
    useLinksStore.setState({ links: [] });
    vi.clearAllMocks();
  });

  it('move 乐观更新并落库', async () => {
    useLinksStore.setState({ links: [L({ id: 'a', sortOrder: 100 }), L({ id: 'b', sortOrder: 200 })] });
    await useLinksStore.getState().move('b', 0);
    expect(api.linkMove).toHaveBeenCalledWith('b', 50);
    expect(useLinksStore.getState().links.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('move 落库失败回滚', async () => {
    api.linkMove.mockRejectedValueOnce(new Error('x'));
    useLinksStore.setState({ links: [L({ id: 'a', sortOrder: 100 }), L({ id: 'b', sortOrder: 200 })] });
    await useLinksStore.getState().move('b', 0);
    expect(useLinksStore.getState().links.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('open 按 kind 分发', async () => {
    await useLinksStore.getState().open(L({ id: 'u', kind: 'url', target: 'https://a.com' }));
    await useLinksStore.getState().open(L({ id: 'p', kind: 'path', target: 'D:\\' }));
    await useLinksStore.getState().open(L({ id: 'c', kind: 'command', target: 'npm -v' }));
    expect(opener.openUrl).toHaveBeenCalledWith('https://a.com');
    expect(opener.openPath).toHaveBeenCalledWith('D:\\');
    expect(api.linkRun).toHaveBeenCalledWith('c');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/stores/links.test.ts`
Expected: FAIL（stores/links.ts 不存在）。

- [ ] **Step 3: 实现 store**

`src/stores/links.ts`：

```typescript
import { create } from 'zustand';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { api } from '../lib/api';
import type { Link, LinkInput } from '../types';
import { applyLinkMove } from '../features/links/links';
import { useUiStore } from './ui';

interface LinksState {
  links: Link[];
  load: () => Promise<void>;
  create: (input: LinkInput) => Promise<void>;
  update: (link: Link) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (id: string, targetIndex: number) => Promise<void>;
  open: (link: Link) => Promise<void>;
}

export const useLinksStore = create<LinksState>((set, get) => ({
  links: [],

  load: async () => {
    try {
      set({ links: await api.linkList() });
    } catch (e) {
      useUiStore.getState().toast(`加载快捷入口失败：${e}`, 'error');
    }
  },

  create: async (input) => {
    try {
      const l = await api.linkCreate(input);
      set((s) => ({ links: [...s.links, l] }));
    } catch (e) {
      useUiStore.getState().toast(`新建快捷入口失败：${e}`, 'error');
      throw e;
    }
  },

  update: async (link) => {
    const before = get().links;
    set((s) => ({ links: s.links.map((l) => (l.id === link.id ? link : l)) }));
    try {
      const saved = await api.linkUpdate(link);
      set((s) => ({ links: s.links.map((l) => (l.id === saved.id ? saved : l)) }));
    } catch (e) {
      set({ links: before });
      useUiStore.getState().toast(`保存快捷入口失败：${e}`, 'error');
      throw e;
    }
  },

  remove: async (id) => {
    try {
      await api.linkDelete(id);
      set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
    } catch (e) {
      useUiStore.getState().toast(`删除快捷入口失败：${e}`, 'error');
    }
  },

  move: async (id, targetIndex) => {
    const r = applyLinkMove(get().links, id, targetIndex);
    if (!r) return;
    const before = get().links;
    set({ links: r.next });
    try {
      await api.linkMove(id, r.sortOrder);
    } catch (e) {
      set({ links: before });
      useUiStore.getState().toast(`排序保存失败：${e}`, 'error');
    }
  },

  open: async (link) => {
    try {
      if (link.kind === 'url') await openUrl(link.target);
      else if (link.kind === 'path') await openPath(link.target);
      else await api.linkRun(link.id);
    } catch (e) {
      useUiStore.getState().toast(`打开失败：${e}`, 'error');
    }
  },
}));
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/stores/links.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/stores/links.ts src/stores/links.test.ts
git commit --no-verify -m "feat: 快捷入口 store（乐观排序与按类型打开）"
```

---

### Task 8: LinksPage + registry + 样式

**Files:**
- Create: `src/features/links/LinksPage.tsx`
- Modify: `src/modules/registry.ts`（import + MODULES 追加）
- Modify: `src/modules/registry.test.ts:5-7`
- Modify: `src/index.css`（末尾追加）

**Interfaces:**
- Consumes: Task 6 纯函数、Task 7 store、dnd-kit（`DndContext`/`PointerSensor`/`closestCenter`，参照 KanbanPage 用法）。

- [ ] **Step 1: registry 注册与测试更新**

`src/modules/registry.ts`：import `LinksPage` 后在 MODULES 末尾追加：

```typescript
  {
    id: 'links',
    name: '快捷入口',
    icon: '⚡',
    description: '网址/文件/命令快速启动',
    defaultEnabled: true,
    route: '/links',
    component: LinksPage,
  },
```

`src/modules/registry.test.ts` 第一个用例改为：

```typescript
  it('包含任务看板、日历、笔记、快捷入口四个内置模块', () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual(['calendar', 'links', 'notes', 'tasks']);
  });
```

- [ ] **Step 2: 实现 LinksPage**

`src/features/links/LinksPage.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Link, LinkKind } from '../../types';
import { kindIcon, normalizeTarget, searchLinks, validateTarget } from './links';
import { useLinksStore } from '../../stores/links';

const KIND_OPTIONS: Array<{ value: LinkKind; label: string }> = [
  { value: 'url', label: '网址' },
  { value: 'path', label: '文件或文件夹' },
  { value: 'command', label: '命令' },
];

const KIND_NAMES: Record<LinkKind, string> = { url: '网址', path: '文件', command: '命令' };

export default function LinksPage() {
  const links = useLinksStore((s) => s.links);
  const load = useLinksStore((s) => s.load);
  const move = useLinksStore((s) => s.move);
  const open = useLinksStore((s) => s.open);
  const remove = useLinksStore((s) => s.remove);

  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<{ mode: 'create' } | { mode: 'edit'; link: Link } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => searchLinks(links, keyword), [links, keyword]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const targetIndex = visible.findIndex((l) => l.id === over.id);
    if (targetIndex >= 0) void move(active.id as string, targetIndex);
  }

  async function handleDelete(link: Link) {
    const ok = await confirm(`删除「${link.title || link.target}」？`, { title: '删除快捷入口' });
    if (ok) await remove(link.id);
  }

  return (
    <div className="links-page">
      <div className="links-toolbar">
        <input
          className="input"
          placeholder="搜索快捷入口…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button className="btn primary" style={{ flex: 'none' }} onClick={() => setEditing({ mode: 'create' })}>
          ＋新建
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="empty">
          <div>
            <p>{keyword ? '没有匹配的快捷入口' : '还没有快捷入口'}</p>
            <button className="btn primary" onClick={() => setEditing({ mode: 'create' })}>
              添加第一个快捷入口
            </button>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visible.map((l) => l.id)} strategy={rectSortingStrategy}>
            <div className="links-grid">
              {visible.map((l) => (
                <LinkCard
                  key={l.id}
                  link={l}
                  onOpen={() => void open(l)}
                  onEdit={() => setEditing({ mode: 'edit', link: l })}
                  onDelete={() => void handleDelete(l)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {editing && (
        <LinkDialog
          initial={editing.mode === 'edit' ? editing.link : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LinkCard({ link, onOpen, onEdit, onDelete }: { link: Link; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="link-card"
      title={`${link.target}\n（拖拽排序，双击打开）`}
      onDoubleClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <span className="link-icon">{kindIcon(link.kind)}</span>
      <span className="link-title">{link.title || link.target}</span>
      <span className="link-kind">{KIND_NAMES[link.kind]}</span>
      <button
        className="link-act"
        title="编辑"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        ✎
      </button>
      <button
        className="link-act"
        title="删除"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        🗑
      </button>
    </div>
  );
}

function LinkDialog({ initial, onClose }: { initial: Link | null; onClose: () => void }) {
  const create = useLinksStore((s) => s.create);
  const update = useLinksStore((s) => s.update);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<LinkKind>(initial?.kind ?? 'url');
  const [target, setTarget] = useState(initial?.target ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const t = normalizeTarget(kind, target);
    const err = validateTarget(kind, t);
    if (err) {
      setError(err);
      return;
    }
    if (initial) {
      await update({ ...initial, title: title.trim(), kind, target: t });
    } else {
      await create({ title: title.trim() || t, kind, target: t });
    }
    onClose();
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? '编辑快捷入口' : '新建快捷入口'}</h3>
        <div className="field">
          <label>标题（留空则用目标）</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：Gmail" />
        </div>
        <div className="field">
          <label>类型</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{kind === 'url' ? '网址' : kind === 'path' ? '文件或文件夹路径' : '命令'}</label>
          <input
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={kind === 'url' ? 'mail.google.com' : kind === 'path' ? 'D:\\资料\\报告.docx' : 'npm run build'}
          />
          {kind === 'command' && <small className="day-hint">⚠ 将在本机执行此命令，请确认来源可信</small>}
          {error && <small style={{ color: 'var(--danger)' }}>{error}</small>}
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={() => void handleSave()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 追加样式**

`src/index.css` 末尾追加：

```css
/* 快捷入口网格 */
.links-page { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }
.links-toolbar { display: flex; gap: 8px; }
.links-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px; align-content: start; overflow-y: auto; flex: 1;
}
.link-card {
  position: relative; background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 10px 10px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  cursor: grab; text-align: center; min-height: 96px;
}
.link-card:active { cursor: grabbing; }
.link-card:hover { border-color: var(--accent); }
.link-icon { font-size: 26px; }
.link-title { font-weight: 600; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.link-kind { font-size: 11px; color: var(--muted); }
.link-act {
  position: absolute; top: 4px; background: none; border: none; cursor: pointer;
  color: var(--muted); padding: 2px; font-size: 12px; display: none;
}
.link-card:hover .link-act { display: block; }
.link-act:hover { color: var(--accent); }
```

- [ ] **Step 4: 全量前端测试 + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部 PASS，零类型错误。

- [ ] **Step 5: 提交**

```bash
git add src/features/links/LinksPage.tsx src/modules/registry.ts src/modules/registry.test.ts src/index.css
git commit --no-verify -m "feat: 快捷入口页面（网格、搜索、弹窗编辑、拖拽排序）并注册"
```

---

### Task 9: README + 全量验证 + 冒烟

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

简介行改为「任务看板 + 日历日程 + 笔记 + 快捷入口」；功能清单「笔记」条目后插入：

```markdown
- **快捷入口**：网址/文件/命令一键启动（系统默认程序打开），网格卡片拖拽排序，关键字过滤。
```

- [ ] **Step 2: 全量测试**

Run: `npx vitest run && cd src-tauri && cargo test`
Expected: 前后端全绿。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit --no-verify -m "docs: README 补充快捷入口模块"
```

- [ ] **Step 4: 冒烟（Tauri 窗口内）**

`npm run tauri dev` 或直接运行已安装 v0.3（若打包）：
1. 侧边栏出现「⚡ 快捷入口」；设置页模块管理含「快捷入口」开关。
2. 新建三类条目：网址 `github.com`（自动补 https）、路径 `C:\Windows`、命令 `notepad`。
3. 双击网址卡→浏览器打开；双击路径卡→资源管理器打开；双击命令卡→记事本启动。
4. 搜索过滤；拖拽换位后重启顺序保留；编辑改类型保存生效；删除有确认。
5. 浅/深主题样式正常；任务/日历/笔记不受影响。

---

## Self-Review 记录

- **Spec 覆盖**：迁移 v5（T1）、Link 模型（T2）、6 commands（T3）、备份 v5（T4）、类型/API（T5）、纯函数含 normalize/validate（T6）、store 含乐观 move 与 open 分发（T7）、页面+注册+样式（T8）、文档+验证（T9）。§3.6 默认启用复用 mergeNewDefaultModules 无需新代码。§4 校验错误内联展示在 T8 弹窗中。§5 安全警示文案在 T8 表单中。
- **占位符**：无 TBD；T3 的 link_run 带实现注（kind 校验以编译通过为准）。
- **类型一致性**：`Link`/`LinkInput` 前后端字段一致（camelCase ↔ serde rename）；`applyLinkMove` 返回 `{next, sortOrder}` 在 T6/T7 一致；`api.linkMove(id, sortOrder)` ↔ Rust `link_move(id, sort_order)` 经 Tauri 自动映射；`KIND_NAMES` 仅在 T8 内部使用。
