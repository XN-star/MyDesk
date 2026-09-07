# 个人工作台 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Tauri 2 + React 18 的 Windows 桌面个人工作台，MVP 含任务看板（三列拖拽）与日历（月历+当日详情）两个模块，本地 SQLite 存储 + JSON 备份，系统通知提醒，全局 Alt+Space 快速面板。

**Architecture:** 前端 React（模块注册表机制驱动侧边栏/路由，Zustand 分仓状态，dnd-kit 拖拽）；Rust 后端负责 SQLite（rusqlite）、备份导入导出、到期提醒轮询、全局快捷键。前后端通过 Tauri IPC（invoke command / event）通信。快速面板是独立 WebviewWindow。

**Tech Stack:** Tauri 2.x、React 18、TypeScript、Zustand、@dnd-kit/core+sortable、date-fns、Vitest+Testing Library、rusqlite(bundled)、tauri-plugin-notification/dialog/global-shortcut、chrono、uuid、anyhow。

**Spec:** `docs/superpowers/specs/2026-09-07-personal-workstation-design.md`

## Global Constraints

- 界面文案全部简体中文；代码、标识符、提交信息中的技术词保持原文；提交信息用中文。
- 所有时间戳（due_at/created_at/updated_at/done_at）格式统一为本地时间无时区 ISO：`YYYY-MM-DDTHH:MM:SS`，前后端一致，可直接字符串比较。
- 任务优先级：`0=低 1=中 2=高 3=紧急`，默认 1。
- 任务状态：`todo | doing | done`；`board_id` 恒为 `'default'`（仅数据层预留，UI 不暴露）。
- 设置键：`enabledModules`（JSON 数组，如 `["tasks","calendar"]`）、`theme`（`system|light|dark`，默认 system）。
- 备份 JSON：`version` 必须为 `1`；导入校验失败零写入。
- 数据库文件：`%APPDATA%/personal-workstation/app.db`；表结构见 spec 第 6 节。
- 每个任务 TDD：可测逻辑先写失败测试再实现；每次提交前测试通过。
- 模块注册表是侧边栏/页面唯一来源：新增模块只允许新建 feature 目录 + registry 加一行。

---

### Task 1: 工程脚手架与基线

**Files:**
- Create: `package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`src/main.tsx`、`src-tauri/**`（由 create-tauri-app 模板提供）
- Create: `.gitignore`（追加模板内容）

**Interfaces:**
- Produces: 可运行的 Tauri 工程根目录；`npm run build` 产出 `dist/`；`cargo check` 通过；依赖包含 zustand、@dnd-kit/*、date-fns、@tauri-apps/api、@tauri-apps/plugin-dialog。

- [ ] **Step 1: 前置检查**

```bash
node --version && npm --version && cargo --version && rustc --version
```
Expected: node ≥ 20、cargo ≥ 1.77 全部有版本号输出。任一缺失则停止并报告。

- [ ] **Step 2: 用 create-tauri-app 在临时目录生成模板并并入仓库根**

```bash
cd "/d/Desktop/Personal Workstation" && mkdir -p /tmp/cta && cd /tmp/cta && rm -rf scaffold
npm create tauri-app@latest scaffold -- --template react-ts --manager npm --yes
cd scaffold && npm install
# 并入仓库根（模板文件全部覆盖到根目录，保留已有 docs/.git）
cp -r /tmp/cta/scaffold/src /tmp/cta/scaffold/src-tauri /tmp/cta/scaffold/public "/d/Desktop/Personal Workstation/"
cp /tmp/cta/scaffold/index.html /tmp/cta/scaffold/package.json /tmp/cta/scaffold/package-lock.json /tmp/cta/scaffold/tsconfig.json /tmp/cta/scaffold/vite.config.ts "/d/Desktop/Personal Workstation/"
cat /tmp/cta/scaffold/.gitignore >> "/d/Desktop/Personal Workstation/.gitignore"
cd "/d/Desktop/Personal Workstation" && npm install
```
Expected: 根目录出现 src/、src-tauri/、index.html 等，`npm install` 无 ERR。

- [ ] **Step 3: 安装业务依赖**

```bash
cd "/d/Desktop/Personal Workstation"
npm install zustand @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities date-fns @tauri-apps/plugin-dialog
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 4: 修改 `src-tauri/tauri.conf.json`**（主窗口中文标题/尺寸 + 标识符）

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "PersonalWorkstation",
  "version": "0.1.0",
  "identifier": "com.personal.workstation",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "个人工作台",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"]
  }
}
```

- [ ] **Step 5: 验证构建**

```bash
cd "/d/Desktop/Personal Workstation" && npm run build && cd src-tauri && cargo check
```
Expected: vite build 成功；cargo check Finished 无 error。

- [ ] **Step 6: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "chore: Tauri 2 + React 脚手架与依赖基线"
```

---

### Task 2: Rust 数据层（建库迁移 + 任务/事件/设置 CRUD）

**Files:**
- Create: `src-tauri/src/db.rs`、`src-tauri/src/models.rs`、`src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`（挂载模块与状态）、`src-tauri/src/main.rs`（调用 lib::run）、`src-tauri/Cargo.toml`（加 rusqlite/chrono/uuid/anyhow/serde_json）
- Test: `src-tauri/src/db.rs`、`src-tauri/src/models.rs` 内 `#[cfg(test)]`

**Interfaces:**
- Produces（后续任务依赖的 command 签名，JS 侧 camelCase）:
  - `task_list() -> Task[]`；`task_create({input: TaskInput}) -> Task`；`task_update({task: Task}) -> Task`；`task_delete({id})`
  - `event_list_month({month: "YYYY-MM"}) -> Event[]`；`event_list_date({date}) -> Event[]`；`event_create({input: EventInput}) -> Event`；`event_update({event: Event}) -> Event`；`event_delete({id})`
  - `settings_all() -> Record<string,string>`；`settings_set({key, value})`
  - Rust 状态：`Db(Mutex<Connection>)`；表结构 SQL 常量 `SCHEMA_V1`；行映射 `task_from_row/event_from_row`；全量查询 `query_all_tasks/query_all_events/query_all_settings`

- [ ] **Step 1: 写失败测试（db.rs 迁移 + models.rs 行映射/查询）**

`src-tauri/src/db.rs` 追加：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migrate_creates_three_tables() {
        let c = mem();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','events','settings')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 3);
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
    }

    #[test]
    fn migrate_is_idempotent() {
        let c = mem();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
    }
}
```

`src-tauri/src/models.rs` 追加：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        c
    }

    #[test]
    fn task_roundtrip_via_row_mapping() {
        let c = mem();
        c.execute(TASK_INSERT, params!["t1", "default", "写报告", "周报", "todo", 2, "2026-09-08T10:00:00", 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let got = query_all_tasks(&c).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].title, "写报告");
        assert_eq!(got[0].due_at.as_deref(), Some("2026-09-08T10:00:00"));
        assert_eq!(got[0].priority, 2);
        assert_eq!(got[0].board_id, "default");
    }

    #[test]
    fn task_input_defaults() {
        let json = r#"{"title":"买牛奶"}"#;
        let input: TaskInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.priority, 1);
        assert_eq!(input.status, "todo");
        assert_eq!(input.due_at, None);
    }

    #[test]
    fn event_input_accepts_camel_case() {
        let json = r#"{"title":"周会","date":"2026-09-08","timeStart":"15:00","timeEnd":"16:00"}"#;
        let input: EventInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.time_start.as_deref(), Some("15:00"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd "/d/Desktop/Personal Workstation/src-tauri" && cargo test
```
Expected: 编译失败（db::migrate / TASK_INSERT 不存在）。

- [ ] **Step 3: 实现（Cargo.toml、db.rs、models.rs、commands.rs、lib.rs、main.rs）**

`src-tauri/Cargo.toml` `[dependencies]` 增加：

```toml
rusqlite = { version = "0.32", features = ["bundled"] }
chrono = "0.4"
uuid = { version = "1", features = ["v4"] }
anyhow = "1"
```
（serde、serde_json 模板已有；没有则补 `serde = { version = "1", features = ["derive"] }`、`serde_json = "1"`）

`src-tauri/src/db.rs`：

```rust
use rusqlite::Connection;

pub const SCHEMA_V1: &str = "
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
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL,
  time_start  TEXT,
  time_end    TEXT,
  note        TEXT DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

pub fn init(app: &tauri::AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    use tauri::Manager;
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("app.db");
    match open(&path) {
        Ok(c) => Ok(c),
        Err(e) => {
            println!("数据库打开失败，重建：{e}");
            let stamp = chrono::Local::now().format("%Y%m%d%H%M%S");
            let _ = std::fs::rename(&path, dir.join(format!("app.db.corrupt-{stamp}")));
            Ok(open(&path)?)
        }
    }
}

pub fn open(path: &std::path::Path) -> Result<Connection, Box<dyn std::error::Error>> {
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(SCHEMA_V1)?;
        conn.pragma_update(None, "user_version", 1)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migrate_creates_three_tables() {
        let c = mem();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','events','settings')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 3);
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 1);
    }

    #[test]
    fn migrate_is_idempotent() {
        let c = mem();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
    }
}
```

`src-tauri/src/models.rs`：

```rust
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

pub const TASK_COLS: &str =
    "id, board_id, title, description, status, priority, due_at, sort_order, done_at, created_at, updated_at";
pub const TASK_INSERT: &str = "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)";
pub const EVENT_COLS: &str = "id, title, date, time_start, time_end, note, created_at";
pub const EVENT_INSERT: &str =
    "INSERT INTO events (id, title, date, time_start, time_end, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)";
pub const SETTING_INSERT: &str = "INSERT INTO settings (key, value) VALUES (?1, ?2)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub board_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: i64,
    pub due_at: Option<String>,
    pub sort_order: f64,
    pub done_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "dft_priority")]
    pub priority: i64,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default = "dft_status")]
    pub status: String,
}

fn dft_priority() -> i64 {
    1
}
fn dft_status() -> String {
    "todo".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventItem {
    pub id: String,
    pub title: String,
    pub date: String,
    pub time_start: Option<String>,
    pub time_end: Option<String>,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub title: String,
    pub date: String,
    #[serde(default)]
    pub time_start: Option<String>,
    #[serde(default)]
    pub time_end: Option<String>,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingRow {
    pub key: String,
    pub value: String,
}

pub fn task_from_row(r: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        board_id: r.get(1)?,
        title: r.get(2)?,
        description: r.get(3)?,
        status: r.get(4)?,
        priority: r.get(5)?,
        due_at: r.get(6)?,
        sort_order: r.get(7)?,
        done_at: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
    })
}

pub fn event_from_row(r: &Row) -> rusqlite::Result<EventItem> {
    Ok(EventItem {
        id: r.get(0)?,
        title: r.get(1)?,
        date: r.get(2)?,
        time_start: r.get(3)?,
        time_end: r.get(4)?,
        note: r.get(5)?,
        created_at: r.get(6)?,
    })
}

pub fn query_all_tasks(c: &Connection) -> rusqlite::Result<Vec<Task>> {
    let mut stmt = c.prepare(&format!("SELECT {TASK_COLS} FROM tasks ORDER BY sort_order"))?;
    stmt.query_map([], task_from_row)?.collect()
}

pub fn query_all_events(c: &Connection) -> rusqlite::Result<Vec<EventItem>> {
    let mut stmt = c.prepare(&format!("SELECT {EVENT_COLS} FROM events ORDER BY date, time_start"))?;
    stmt.query_map([], event_from_row)?.collect()
}

pub fn query_all_settings(c: &Connection) -> rusqlite::Result<Vec<SettingRow>> {
    let mut stmt = c.prepare("SELECT key, value FROM settings")?;
    stmt.query_map([], |r| {
        Ok(SettingRow { key: r.get(0)?, value: r.get(1)? })
    })?
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        c
    }

    #[test]
    fn task_roundtrip_via_row_mapping() {
        let c = mem();
        c.execute(TASK_INSERT, params!["t1", "default", "写报告", "周报", "todo", 2, "2026-09-08T10:00:00", 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let got = query_all_tasks(&c).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].title, "写报告");
        assert_eq!(got[0].due_at.as_deref(), Some("2026-09-08T10:00:00"));
        assert_eq!(got[0].priority, 2);
        assert_eq!(got[0].board_id, "default");
    }

    #[test]
    fn task_input_defaults() {
        let json = r#"{"title":"买牛奶"}"#;
        let input: TaskInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.priority, 1);
        assert_eq!(input.status, "todo");
        assert_eq!(input.due_at, None);
    }

    #[test]
    fn event_input_accepts_camel_case() {
        let json = r#"{"title":"周会","date":"2026-09-08","timeStart":"15:00","timeEnd":"16:00"}"#;
        let input: EventInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.time_start.as_deref(), Some("15:00"));
    }
}
```

`src-tauri/src/commands.rs`：

```rust
use crate::models::*;
use crate::Db;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

type DbState<'a> = State<'a, Db>;

pub fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn with_conn<T>(db: DbState, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    f(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn task_list(db: DbState) -> Result<Vec<Task>, String> {
    with_conn(db, query_all_tasks)
}

#[tauri::command]
pub fn task_create(db: DbState, input: TaskInput) -> Result<Task, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let max: f64 = c.query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM tasks WHERE status = ?1",
            params![input.status],
            |r| r.get(0),
        )?;
        let t = Task {
            id: Uuid::new_v4().to_string(),
            board_id: "default".into(),
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            due_at: input.due_at,
            sort_order: max + 100.0,
            done_at: None,
            created_at: now.clone(),
            updated_at: now,
        };
        c.execute(TASK_INSERT, params![t.id, t.board_id, t.title, t.description, t.status, t.priority, t.due_at, t.sort_order, t.done_at, t.created_at, t.updated_at])?;
        Ok(t)
    })
}

#[tauri::command]
pub fn task_update(db: DbState, task: Task) -> Result<Task, String> {
    with_conn(db, move |c| {
        c.execute(
            "UPDATE tasks SET board_id=?2, title=?3, description=?4, status=?5, priority=?6, due_at=?7, sort_order=?8, done_at=?9, updated_at=?10 WHERE id=?1",
            params![task.id, task.board_id, task.title, task.description, task.status, task.priority, task.due_at, task.sort_order, task.done_at, now_iso()],
        )?;
        Ok(task)
    })
}

#[tauri::command]
pub fn task_delete(db: DbState, id: String) -> Result<(), String> {
    with_conn(db, move |c| {
        c.execute("DELETE FROM tasks WHERE id=?1", params![id])?;
        Ok(())
    })
}

#[tauri::command]
pub fn event_list_month(db: DbState, month: String) -> Result<Vec<EventItem>, String> {
    with_conn(db, move |c| {
        let pattern = format!("{month}%");
        let mut stmt = c.prepare(&format!(
            "SELECT {EVENT_COLS} FROM events WHERE date LIKE ?1 ORDER BY date, time_start"
        ))?;
        stmt.query_map(params![pattern], event_from_row)?.collect()
    })
}

#[tauri::command]
pub fn event_list_date(db: DbState, date: String) -> Result<Vec<EventItem>, String> {
    with_conn(db, move |c| {
        let mut stmt = c.prepare(&format!(
            "SELECT {EVENT_COLS} FROM events WHERE date = ?1 ORDER BY time_start"
        ))?;
        stmt.query_map(params![date], event_from_row)?.collect()
    })
}

#[tauri::command]
pub fn event_create(db: DbState, input: EventInput) -> Result<EventItem, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let e = EventItem {
            id: Uuid::new_v4().to_string(),
            title: input.title,
            date: input.date,
            time_start: input.time_start,
            time_end: input.time_end,
            note: input.note,
            created_at: now,
        };
        c.execute(EVENT_INSERT, params![e.id, e.title, e.date, e.time_start, e.time_end, e.note, e.created_at])?;
        Ok(e)
    })
}

#[tauri::command]
pub fn event_update(db: DbState, event: EventItem) -> Result<EventItem, String> {
    with_conn(db, move |c| {
        c.execute(
            "UPDATE events SET title=?2, date=?3, time_start=?4, time_end=?5, note=?6 WHERE id=?1",
            params![event.id, event.title, event.date, event.time_start, event.time_end, event.note],
        )?;
        Ok(event)
    })
}

#[tauri::command]
pub fn event_delete(db: DbState, id: String) -> Result<(), String> {
    with_conn(db, move |c| {
        c.execute("DELETE FROM events WHERE id=?1", params![id])?;
        Ok(())
    })
}

#[tauri::command]
pub fn settings_all(db: DbState) -> Result<HashMap<String, String>, String> {
    with_conn(db, |c| {
        let rows = query_all_settings(c)?;
        Ok(rows.into_iter().map(|s| (s.key, s.value)).collect())
    })
}

#[tauri::command]
pub fn settings_set(db: DbState, key: String, value: String) -> Result<(), String> {
    with_conn(db, move |c| {
        c.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=?2",
            params![key, value],
        )?;
        Ok(())
    })
}
```

`src-tauri/src/lib.rs`（本任务先不含备份/提醒/快捷键命令，后续任务追加）：

```rust
mod commands;
mod db;
mod models;

use std::sync::Mutex;

pub struct Db(pub Mutex<rusqlite::Connection>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = db::init(app.handle())?;
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::task_list,
            commands::task_create,
            commands::task_update,
            commands::task_delete,
            commands::event_list_month,
            commands::event_list_date,
            commands::event_create,
            commands::event_update,
            commands::event_delete,
            commands::settings_all,
            commands::settings_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`src-tauri/src/main.rs`：

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    workstation_lib::run();
}
```
（若模板的 crate 名不同，把 `workstation_lib` 改成模板 lib.rs 实际的库名，见 Cargo.toml `[lib] name`。）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd "/d/Desktop/Personal Workstation/src-tauri" && cargo test
```
Expected: 全部 test ok。

- [ ] **Step 5: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: SQLite 数据层与任务/事件/设置 CRUD 命令"
```

---

### Task 3: 备份导出/导入

**Files:**
- Create: `src-tauri/src/backup.rs`
- Modify: `src-tauri/src/lib.rs`（mod backup + 2 个 command）、`src-tauri/src/commands.rs`（backup_export/backup_import）
- Test: `src-tauri/src/backup.rs` 内 `#[cfg(test)]`

**Interfaces:**
- Consumes: Task 2 的 `query_all_tasks/query_all_events/query_all_settings`、`TASK_INSERT/EVENT_INSERT/SETTING_INSERT`、`Db`。
- Produces: command `backup_export({path})`、`backup_import({path}) -> number`（导入条数）；`backup::export/import`。

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{query_all_settings, query_all_tasks, TASK_INSERT, EVENT_INSERT, SETTING_INSERT};
    use rusqlite::params;

    fn mem() -> rusqlite::Connection {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        c
    }

    fn seed(c: &rusqlite::Connection) {
        c.execute(TASK_INSERT, params!["t1", "default", "任务A", "", "todo", 1, "2026-09-08T10:00:00", 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        c.execute(EVENT_INSERT, params!["e1", "周会", "2026-09-08", Some("15:00"), None::<String>, "", "2026-09-07T09:00:00"]).unwrap();
        c.execute(SETTING_INSERT, params!["theme", "\"dark\""]).unwrap();
    }

    #[test]
    fn export_then_import_roundtrip() {
        let src = mem();
        seed(&src);
        let file = std::env::temp_dir().join(format!("ws-bk-{}.json", std::process::id()));
        export(&src, &file).unwrap();

        let mut dst = mem();
        let n = import(&mut dst, &file).unwrap();
        assert_eq!(n, 2);
        assert_eq!(query_all_tasks(&dst).unwrap().len(), 1);
        assert_eq!(query_all_settings(&dst).unwrap().len(), 1);

        let text = std::fs::read_to_string(&file).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["version"], 1);
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_rejects_bad_version_and_zero_writes() {
        let file = std::env::temp_dir().join(format!("ws-bk-bad-{}.json", std::process::id()));
        std::fs::write(&file, r#"{"version": 99, "tasks": []}"#).unwrap();
        let mut c = mem();
        c.execute(TASK_INSERT, params!["keep", "default", "保留", "", "todo", 1, None::<String>, 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let err = import(&mut c, &file).unwrap_err();
        assert!(err.to_string().contains("不支持的备份版本"));
        assert_eq!(query_all_tasks(&c).unwrap().len(), 1, "校验失败必须零写入");
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_rejects_broken_json() {
        let file = std::env::temp_dir().join(format!("ws-bk-broken-{}.json", std::process::id()));
        std::fs::write(&file, "{oops").unwrap();
        let mut c = mem();
        assert!(import(&mut c, &file).is_err());
        std::fs::remove_file(&file).ok();
    }
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd "/d/Desktop/Personal Workstation/src-tauri" && cargo test backup
```
Expected: 编译失败（backup 模块不存在）。

- [ ] **Step 3: 实现 `src-tauri/src/backup.rs`**

```rust
use crate::models::*;
use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection};
use serde_json::json;
use std::path::Path;

pub const VERSION: i64 = 1;

pub fn export(conn: &Connection, path: &Path) -> Result<()> {
    let tasks = query_all_tasks(conn)?;
    let events = query_all_events(conn)?;
    let settings = query_all_settings(conn)?;
    let doc = json!({
        "version": VERSION,
        "exportedAt": crate::commands::now_iso(),
        "tasks": tasks,
        "events": events,
        "settings": settings,
    });
    std::fs::write(path, serde_json::to_vec_pretty(&doc)?)?;
    Ok(())
}

pub fn import(conn: &mut Connection, path: &Path) -> Result<usize> {
    let text = std::fs::read_to_string(path).with_context(|| "无法读取备份文件")?;
    let doc: serde_json::Value = serde_json::from_str(&text).with_context(|| "备份文件不是合法 JSON")?;
    if doc.get("version").and_then(|v| v.as_i64()) != Some(VERSION) {
        bail!("不支持的备份版本（需要 version={VERSION}）");
    }
    let tasks: Vec<Task> = serde_json::from_value(doc.get("tasks").cloned().unwrap_or_default())
        .context("tasks 字段缺失或格式错误")?;
    let events: Vec<EventItem> = serde_json::from_value(doc.get("events").cloned().unwrap_or_default())
        .context("events 字段缺失或格式错误")?;
    let settings: Vec<SettingRow> = serde_json::from_value(doc.get("settings").cloned().unwrap_or_default())
        .context("settings 字段缺失或格式错误")?;

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tasks", [])?;
    tx.execute("DELETE FROM events", [])?;
    tx.execute("DELETE FROM settings", [])?;
    for t in &tasks {
        tx.execute(TASK_INSERT, params![t.id, t.board_id, t.title, t.description, t.status, t.priority, t.due_at, t.sort_order, t.done_at, t.created_at, t.updated_at])?;
    }
    for e in &events {
        tx.execute(EVENT_INSERT, params![e.id, e.title, e.date, e.time_start, e.time_end, e.note, e.created_at])?;
    }
    for s in &settings {
        tx.execute(SETTING_INSERT, params![s.key, s.value])?;
    }
    tx.commit()?;
    Ok(tasks.len() + events.len())
}
```

`commands.rs` 追加：

```rust
#[tauri::command]
pub fn backup_export(db: DbState, path: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    crate::backup::export(&conn, std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn backup_import(db: DbState, path: String) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut conn = conn;
    crate::backup::import(&mut conn, std::path::Path::new(&path)).map_err(|e| e.to_string())
}
```

`lib.rs`：加 `mod backup;`，`invoke_handler` 追加 `commands::backup_export, commands::backup_import,`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd "/d/Desktop/Personal Workstation/src-tauri" && cargo test
```
Expected: 全部 ok（含 Task 2 的测试）。

- [ ] **Step 5: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 备份导出/导入（版本校验，失败零写入）"
```

---

### Task 4: 前端基线（类型 / API 封装 / 工具函数 / 状态仓库）

**Files:**
- Create: `src/types.ts`、`src/lib/api.ts`、`src/lib/format.ts`、`src/lib/theme.ts`、`src/lib/summary.ts`、`src/stores/tasks.ts`、`src/stores/events.ts`、`src/stores/settings.ts`、`src/stores/ui.ts`
- Modify: `vite.config.ts`（加 vitest test 配置）
- Test: `src/lib/format.test.ts`、`src/lib/theme.test.ts`、`src/lib/summary.test.ts`

**Interfaces:**
- Consumes: Task 2 的全部 command。
- Produces:
  - `types.ts`：`Task/TaskInput/EventItem/EventInput/TaskStatus`
  - `api`：`taskList/taskCreate/taskUpdate/taskDelete/eventListMonth/eventListDate/eventCreate/eventUpdate/eventDelete/settingsAll/settingsSet/backupExport/backupImport`
  - `format.ts`：`localNowIso()/toDateStr(d)/dateOf(iso)/dueLabel(iso, now?)/isOverdue(t)/toLocalInput(iso)/fromLocalInput(v)/monthOf(date)/addMonths(dateStr, n)`
  - `theme.ts`：`ThemeMode`、`resolveDark(mode, systemDark)`、`applyTheme(mode)`
  - `summary.ts`：`summarize(tasks, events, today, now?) -> { todoCount, eventCount, nextLabel }`
  - stores：`useTaskStore`（tasks/load/create/update/remove/move）、`useEventStore`（events/month/loadMonth/create/update/remove）、`useSettingsStore`（enabledModules/theme/load/setEnabled/setTheme）、`useUiStore`（activePage/drawer/toasts/setPage/openCreate/openTask/closeDrawer/toast/dismiss）
  - `move` 使用 Task 6 的 `applyMove`（本任务先占位为直传 store.update，Task 6 接管）。

- [ ] **Step 1: 写失败测试**

`src/lib/format.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { dateOf, dueLabel, isOverdue, monthOf, toDateStr, toLocalInput } from './format';

const now = new Date('2026-09-07T10:00:00');

describe('format', () => {
  it('toDateStr 输出 YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 8, 7))).toBe('2026-09-07');
  });

  it('dateOf 取日期部分', () => {
    expect(dateOf('2026-09-08T10:00:00')).toBe('2026-09-08');
    expect(dateOf(null)).toBeNull();
  });

  it('monthOf 取月份', () => {
    expect(monthOf('2026-09-07')).toBe('2026-09');
  });

  it('dueLabel 未来 1 小时', () => {
    expect(dueLabel('2026-09-07T11:00:00', now)).toBe('1小时后');
  });

  it('dueLabel 未来 3 天', () => {
    expect(dueLabel('2026-09-10T09:00:00', now)).toBe('3天后');
  });

  it('dueLabel 已过期', () => {
    expect(dueLabel('2026-09-07T08:00:00', now)).toBe('已过期');
  });

  it('isOverdue 只对未完成且已过期任务为真', () => {
    expect(isOverdue({ status: 'todo', dueAt: '2026-09-07T08:00:00' } as never, now)).toBe(true);
    expect(isOverdue({ status: 'done', dueAt: '2026-09-07T08:00:00' } as never, now)).toBe(false);
    expect(isOverdue({ status: 'todo', dueAt: null } as never, now)).toBe(false);
  });

  it('toLocalInput 截断到分钟（datetime-local 用）', () => {
    expect(toLocalInput('2026-09-08T10:00:00')).toBe('2026-09-08T10:00');
    expect(toLocalInput(null)).toBe('');
  });
});
```

`src/lib/theme.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { resolveDark } from './theme';

describe('resolveDark', () => {
  it('system 跟随系统', () => {
    expect(resolveDark('system', true)).toBe(true);
    expect(resolveDark('system', false)).toBe(false);
  });
  it('light 恒为浅色，dark 恒为深色', () => {
    expect(resolveDark('light', true)).toBe(false);
    expect(resolveDark('dark', false)).toBe(true);
  });
});
```

`src/lib/summary.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { summarize } from './summary';

const base = { boardId: 'default', description: '', sortOrder: 0, doneAt: null, createdAt: '', updatedAt: '' };

describe('summarize', () => {
  it('统计未完成任务数、今日事件数与下个截止', () => {
    const tasks = [
      { ...base, id: '1', title: 'a', status: 'todo', priority: 1, dueAt: '2026-09-07T12:00:00' },
      { ...base, id: '2', title: 'b', status: 'done', priority: 1, dueAt: null },
      { ...base, id: '3', title: 'c', status: 'doing', priority: 1, dueAt: '2026-09-08T09:00:00' },
    ] as never[];
    const events = [
      { id: 'e1', title: '今天的会', date: '2026-09-07' },
      { id: 'e2', title: '明天的会', date: '2026-09-08' },
    ] as never[];
    const s = summarize(tasks, events, '2026-09-07', new Date('2026-09-07T10:00:00'));
    expect(s.todoCount).toBe(2);
    expect(s.eventCount).toBe(1);
    expect(s.nextLabel).toBe('2小时后');
  });
});
```

- [ ] **Step 2: 配置 vitest 并运行确认失败**

`vite.config.ts` 在 `defineConfig({...})` 内加：

```ts
test: { environment: 'jsdom', globals: true },
```
并在文件首行加 `/// <reference types="vitest" />`。

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`src/types.ts`：

```ts
export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  boardId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number; // 0低 1中 2高 3紧急
  dueAt: string | null;
  sortOrder: number;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: number;
  dueAt?: string | null;
  status?: TaskStatus;
}

export interface EventItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  timeStart: string | null; // HH:MM
  timeEnd: string | null;
  note: string;
  createdAt: string;
}

export interface EventInput {
  title: string;
  date: string;
  timeStart?: string | null;
  timeEnd?: string | null;
  note?: string;
}
```

`src/lib/api.ts`：

```ts
import { invoke } from '@tauri-apps/api/core';
import type { EventInput, EventItem, Task, TaskInput } from '../types';

export const api = {
  taskList: () => invoke<Task[]>('task_list'),
  taskCreate: (input: TaskInput) => invoke<Task>('task_create', { input }),
  taskUpdate: (task: Task) => invoke<Task>('task_update', { task }),
  taskDelete: (id: string) => invoke<void>('task_delete', { id }),
  eventListMonth: (month: string) => invoke<EventItem[]>('event_list_month', { month }),
  eventListDate: (date: string) => invoke<EventItem[]>('event_list_date', { date }),
  eventCreate: (input: EventInput) => invoke<EventItem>('event_create', { input }),
  eventUpdate: (event: EventItem) => invoke<EventItem>('event_update', { event }),
  eventDelete: (id: string) => invoke<void>('event_delete', { id }),
  settingsAll: () => invoke<Record<string, string>>('settings_all'),
  settingsSet: (key: string, value: string) => invoke<void>('settings_set', { key, value }),
  backupExport: (path: string) => invoke<void>('backup_export', { path }),
  backupImport: (path: string) => invoke<number>('backup_import', { path }),
};
```

`src/lib/format.ts`：

```ts
import type { Task } from '../types';

export function localNowIso(): string {
  return fromDate(new Date());
}

export function fromDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function toDateStr(d: Date): string {
  return fromDate(d).slice(0, 10);
}

export function dateOf(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function toLocalInput(iso: string | null): string {
  return iso ? iso.slice(0, 16) : '';
}

export function fromLocalInput(v: string): string | null {
  return v ? `${v}:00` : null;
}

export function isOverdue(task: Pick<Task, 'status' | 'dueAt'>, now: Date = new Date()): boolean {
  return !!task.dueAt && task.status !== 'done' && task.dueAt < fromDate(now);
}

/** 截止时间的中文相对描述 */
export function dueLabel(iso: string, now: Date = new Date()): string {
  const due = new Date(iso);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) return '已过期';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}分钟后`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}小时后`;
  const days = Math.round(hours / 24);
  return `${days}天后`;
}
```

`src/lib/theme.ts`：

```ts
export type ThemeMode = 'system' | 'light' | 'dark';

export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemDark);
}

export function applyTheme(mode: ThemeMode): boolean {
  const dark = resolveDark(mode, window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  return dark;
}
```

`src/lib/summary.ts`：

```ts
import type { EventItem, Task } from '../types';
import { fromDate, isOverdue } from './format';

export interface DaySummary {
  todoCount: number;
  eventCount: number;
  nextLabel: string;
}

export function summarize(tasks: Task[], events: EventItem[], today: string, now: Date = new Date()): DaySummary {
  const todoCount = tasks.filter((t) => t.status !== 'done').length;
  const eventCount = events.filter((e) => e.date === today).length;
  const next = tasks
    .filter((t) => t.status !== 'done' && t.dueAt && t.dueAt >= fromDate(now))
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  const nextLabel = next?.dueAt ? dueLabelOf(next.dueAt, now) : '无';
  void isOverdue;
  return { todoCount, eventCount, nextLabel };
}

function dueLabelOf(iso: string, now: Date): string {
  const due = new Date(iso);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) return '已过期';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}分钟后`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}小时后`;
  return `${Math.round(hours / 24)}天后`;
}
```

`src/stores/ui.ts`：

```ts
import { create } from 'zustand';
import type { TaskStatus } from '../types';

export type Drawer = { mode: 'create'; status: TaskStatus } | { mode: 'edit'; taskId: string } | null;

export interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'error';
}

interface UiState {
  activePage: string;
  drawer: Drawer;
  toasts: Toast[];
  setPage: (p: string) => void;
  openCreate: (status: TaskStatus) => void;
  openTask: (id: string) => void;
  closeDrawer: () => void;
  toast: (msg: string, kind?: 'info' | 'error') => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set, get) => ({
  activePage: 'tasks',
  drawer: null,
  toasts: [],
  setPage: (p) => set({ activePage: p }),
  openCreate: (status) => set({ drawer: { mode: 'create', status } }),
  openTask: (id) => set({ drawer: { mode: 'edit', taskId: id } }),
  closeDrawer: () => set({ drawer: null }),
  toast: (msg, kind = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, msg, kind }] });
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
```

`src/stores/tasks.ts`：

```ts
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Task, TaskInput } from '../types';

interface TaskState {
  tasks: Task[];
  load: () => Promise<void>;
  create: (input: TaskInput) => Promise<Task>;
  update: (task: Task) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  load: async () => {
    try {
      set({ tasks: await api.taskList() });
    } catch (e) {
      useUiStore.getState().toast(`加载任务失败：${e}`, 'error');
    }
  },
  create: async (input) => {
    const t = await api.taskCreate(input);
    set({ tasks: [...get().tasks, t] });
    return t;
  },
  update: async (task) => {
    try {
      const t = await api.taskUpdate(task);
      set({ tasks: get().tasks.map((x) => (x.id === t.id ? t : x)) });
    } catch (e) {
      useUiStore.getState().toast(`保存任务失败：${e}`, 'error');
      throw e;
    }
  },
  remove: async (id) => {
    await api.taskDelete(id);
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
  },
}));

import { useUiStore } from './ui';
```

`src/stores/events.ts`：

```ts
import { create } from 'zustand';
import { api } from '../lib/api';
import { monthOf, toDateStr } from '../lib/format';
import type { EventInput, EventItem } from '../types';
import { useUiStore } from './ui';

interface EventState {
  events: EventItem[]; // 已加载的当前月份
  month: string;
  loadMonth: (month?: string) => Promise<void>;
  create: (input: EventInput) => Promise<void>;
  update: (e: EventItem) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  month: monthOf(toDateStr(new Date())),
  loadMonth: async (month) => {
    const m = month ?? get().month;
    try {
      set({ month: m, events: await api.eventListMonth(m) });
    } catch (e) {
      useUiStore.getState().toast(`加载日程失败：${e}`, 'error');
    }
  },
  create: async (input) => {
    const e = await api.eventCreate(input);
    if (monthOf(e.date) === get().month) set({ events: [...get().events, e] });
  },
  update: async (e) => {
    await api.eventUpdate(e);
    set({ events: get().events.map((x) => (x.id === e.id ? e : x)) });
  },
  remove: async (id) => {
    await api.eventDelete(id);
    set({ events: get().events.filter((e) => e.id !== id) });
  },
}));
```

`src/stores/settings.ts`：

```ts
import { create } from 'zustand';
import { api } from '../lib/api';
import type { ThemeMode } from '../lib/theme';
import { MODULES } from '../modules/registry';
import { useUiStore } from './ui';

interface SettingsState {
  enabledModules: string[];
  theme: ThemeMode;
  load: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  setTheme: (t: ThemeMode) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  enabledModules: MODULES.filter((m) => m.defaultEnabled).map((m) => m.id),
  theme: 'system',
  load: async () => {
    try {
      const all = await api.settingsAll();
      const enabled = all.enabledModules ? (JSON.parse(all.enabledModules) as string[]) : undefined;
      const theme = (all.theme as ThemeMode) || 'system';
      set({ enabledModules: enabled ?? get().enabledModules, theme });
    } catch (e) {
      useUiStore.getState().toast(`加载设置失败：${e}`, 'error');
    }
  },
  setEnabled: async (id, enabled) => {
    const next = enabled
      ? Array.from(new Set([...get().enabledModules, id]))
      : get().enabledModules.filter((x) => x !== id);
    set({ enabledModules: next });
    await api.settingsSet('enabledModules', JSON.stringify(next));
  },
  setTheme: async (t) => {
    set({ theme: t });
    await api.settingsSet('theme', t);
  },
}));
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run
```
Expected: 3 个测试文件全部 PASS。若 store 里 import 顺序有 lint 告警可忽略（无 eslint 配置）。

- [ ] **Step 5: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 前端类型/Tauri API 封装/工具函数/Zustand 状态仓库"
```

---

### Task 5: 模块注册表与应用外壳（侧边栏 + 今日摘要条 + 主题接入）

**Files:**
- Create: `src/modules/types.ts`、`src/modules/registry.ts`、`src/components/Sidebar.tsx`、`src/components/TodayBar.tsx`、`src/components/Toasts.tsx`、`src/App.tsx`（覆盖模板）、`src/index.css`（覆盖模板）
- Modify: `src/main.tsx`（渲染 App）、删除模板 `src/App.css`
- Test: `src/modules/registry.test.ts`

**Interfaces:**
- Consumes: Task 4 全部 store 与工具。
- Produces: `Module` 接口（`id/name/icon/description/defaultEnabled/route/component`）、`MODULES`、`enabledModules(ids)`；应用外壳布局。

- [ ] **Step 1: 写失败测试**

`src/modules/registry.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { enabledModules, MODULES } from './registry';

describe('registry', () => {
  it('包含任务看板与日历两个内置模块', () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual(['calendar', 'tasks']);
  });

  it('enabledModules 只返回启用的模块且保持注册顺序', () => {
    const result = enabledModules(['calendar']);
    expect(result.map((m) => m.id)).toEqual(['calendar']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run src/modules
```
Expected: FAIL（registry 不存在）。

- [ ] **Step 3: 实现**

`src/modules/types.ts`：

```ts
import type { ComponentType } from 'react';

export interface Module {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultEnabled: boolean;
  route: string;
  component: ComponentType;
}
```

`src/modules/registry.ts`：

```ts
import type { Module } from './types';
import KanbanPage from '../features/tasks/KanbanPage';
import CalendarPage from '../features/calendar/CalendarPage';

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
];

export function enabledModules(enabledIds: string[]): Module[] {
  return MODULES.filter((m) => enabledIds.includes(m.id));
}
```
（KanbanPage/CalendarPage 先建占位文件，Task 6/7 填充：`export default function KanbanPage() { return <div>任务看板</div>; }`）

`src/components/Sidebar.tsx`：

```tsx
import { enabledModules } from '../modules/registry';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';

export default function Sidebar() {
  const enabled = enabledModules(useSettingsStore((s) => s.enabledModules));
  const { activePage, setPage } = useUiStore();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">◆</div>
      {enabled.map((m) => (
        <button
          key={m.id}
          className={`side-item${activePage === m.id ? ' active' : ''}`}
          title={m.name}
          onClick={() => setPage(m.id)}
        >
          <span className="side-icon">{m.icon}</span>
          <span className="side-name">{m.name}</span>
        </button>
      ))}
      <div className="sidebar-spacer" />
      <button
        className={`side-item${activePage === 'settings' ? ' active' : ''}`}
        title="设置"
        onClick={() => setPage('settings')}
      >
        <span className="side-icon">⚙</span>
        <span className="side-name">设置</span>
      </button>
    </nav>
  );
}
```

`src/components/TodayBar.tsx`：

```tsx
import { summarize } from '../lib/summary';
import { toDateStr } from '../lib/format';
import { useEventStore } from '../stores/events';
import { useTaskStore } from '../stores/tasks';

export default function TodayBar() {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);
  const today = toDateStr(new Date());
  const s = summarize(tasks, events, today);

  return (
    <div className="today-bar">
      <span>今日：{s.todoCount} 个未完成任务</span>
      <span>{s.eventCount} 个日程</span>
      <span>下个截止：{s.nextLabel}</span>
    </div>
  );
}
```

`src/components/Toasts.tsx`：

```tsx
import { useUiStore } from '../stores/ui';

export default function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}
```

`src/App.tsx`（整体覆盖模板）：

```tsx
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Sidebar from './components/Sidebar';
import TodayBar from './components/TodayBar';
import Toasts from './components/Toasts';
import TaskDrawer from './features/tasks/TaskDrawer';
import { enabledModules } from './modules/registry';
import { applyTheme } from './lib/theme';
import { useEventStore } from './stores/events';
import { useSettingsStore } from './stores/settings';
import { useTaskStore } from './stores/tasks';
import { useUiStore } from './stores/ui';

export default function App() {
  const activePage = useUiStore((s) => s.activePage);
  const drawer = useUiStore((s) => s.drawer);
  const enabled = enabledModules(useSettingsStore((s) => s.enabledModules));
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    useSettingsStore.getState().load().then(() => {
      useTaskStore.getState().load();
      useEventStore.getState().loadMonth();
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => applyTheme('system');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [theme]);

  useEffect(() => {
    const un1 = listen('quick://changed', () => {
      useTaskStore.getState().load();
      useEventStore.getState().loadMonth();
    });
    const un2 = listen<{ type: 'task'; id: string }>('quick://open', async (e) => {
      const w = getCurrentWindow();
      await w.show();
      await w.setFocus();
      if (e.payload.type === 'task') useUiStore.getState().openTask(e.payload.id);
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
  }, []);

  const current = enabled.find((m) => m.id === activePage) ?? enabled[0];
  const Page = current?.component;

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <TodayBar />
        <div className="content">
          {Page ? <Page /> : <div className="empty">请先在设置中启用至少一个模块</div>}
        </div>
      </div>
      {drawer && <TaskDrawer />}
      <Toasts />
    </div>
  );
}
```

`src/index.css`（整体覆盖模板）：

```css
:root {
  --bg: #f5f6f8;
  --panel: #ffffff;
  --text: #1c1e21;
  --muted: #6b7280;
  --border: #e5e7eb;
  --accent: #3b82f6;
  --danger: #ef4444;
  --ok: #22c55e;
  --warn: #f59e0b;
}
.dark {
  --bg: #101418;
  --panel: #1a2027;
  --text: #e5e7eb;
  --muted: #9ca3af;
  --border: #2d333b;
  --accent: #60a5fa;
  --danger: #f87171;
  --ok: #4ade80;
  --warn: #fbbf24;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
  font-size: 14px;
  user-select: none;
}
input, textarea, select, button { font-family: inherit; color: inherit; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; }
.btn {
  background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
  padding: 6px 12px; cursor: pointer;
}
.btn:hover { border-color: var(--accent); }
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn.danger { color: var(--danger); }
.input {
  width: 100%; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--bg);
}
.app { display: flex; height: 100%; }
.sidebar {
  width: 168px; flex: none; display: flex; flex-direction: column; gap: 4px;
  padding: 12px 8px; background: var(--panel); border-right: 1px solid var(--border);
}
.sidebar-logo { font-size: 20px; padding: 4px 10px 12px; color: var(--accent); }
.side-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; border-radius: 8px;
  padding: 8px 10px; cursor: pointer; text-align: left;
}
.side-item:hover { background: var(--bg); }
.side-item.active { background: var(--bg); color: var(--accent); }
.sidebar-spacer { flex: 1; }
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.today-bar {
  display: flex; gap: 24px; padding: 10px 20px;
  border-bottom: 1px solid var(--border); background: var(--panel);
  color: var(--muted);
}
.content { flex: 1; overflow: auto; padding: 16px 20px; }
.empty { display: grid; place-items: center; height: 100%; color: var(--muted); }
.toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 99; }
.toast { background: var(--panel); border: 1px solid var(--border); border-left: 4px solid var(--accent); padding: 10px 14px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.15); }
.toast.error { border-left-color: var(--danger); }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; justify-content: flex-end; z-index: 50; }
.drawer { width: 380px; background: var(--panel); border-left: 1px solid var(--border); padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.drawer h3 { margin: 0; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { color: var(--muted); font-size: 12px; }
.drawer-actions { display: flex; gap: 8px; margin-top: auto; }
```

`src/main.tsx`：

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

同时删除模板的 `src/App.css`（若存在引用则去掉 import）。

- [ ] **Step 4: 测试 + 构建验证**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run && npm run build
```
Expected: registry 测试 PASS；vite build 成功。

- [ ] **Step 5: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 模块注册表与应用外壳（动态侧边栏/今日摘要/主题/通知联动）"
```

---

### Task 6: 任务看板（三列拖拽 + 编辑抽屉）

**Files:**
- Create: `src/features/tasks/dnd.ts`、`src/features/tasks/KanbanPage.tsx`（覆盖占位）、`src/features/tasks/TaskColumn.tsx`、`src/features/tasks/TaskCard.tsx`、`src/features/tasks/TaskDrawer.tsx`
- Test: `src/features/tasks/dnd.test.ts`

**Interfaces:**
- Consumes: `useTaskStore`、`useUiStore.openCreate`、`api.taskUpdate`（通过 store.update）、Task 4 的 `isOverdue`。
- Produces: `applyMove(tasks, taskId, targetStatus, targetIndex) -> Task[]`（纯函数）；`STATUSES`。

- [ ] **Step 1: 写失败测试**

`src/features/tasks/dnd.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { applyMove } from './dnd';
import type { Task } from '../../types';

function t(id: string, status: Task['status'], sortOrder: number): Task {
  return {
    id, boardId: 'default', title: id, description: '', status, priority: 1,
    dueAt: null, sortOrder, doneAt: null, createdAt: '', updatedAt: '',
  };
}

describe('applyMove', () => {
  it('移入空列 sort_order 为 100', () => {
    const tasks = [t('a', 'todo', 100)];
    const [moved] = applyMove(tasks, 'a', 'doing', 0);
    expect(moved.status).toBe('doing');
    expect(moved.sortOrder).toBe(100);
  });

  it('插入两卡片中间取中点', () => {
    const tasks = [t('a', 'todo', 100), t('b', 'doing', 100), t('c', 'doing', 200)];
    const [moved] = applyMove(tasks, 'a', 'doing', 1);
    expect(moved.sortOrder).toBe(150);
  });

  it('拖入 done 记录 doneAt，拖回 todo 清除 doneAt', () => {
    const tasks = [t('a', 'todo', 100)];
    const [done] = applyMove(tasks, 'a', 'done', 0);
    expect(done.doneAt).toBeTruthy();
    const [back] = applyMove([done], 'a', 'todo', 0);
    expect(back.doneAt).toBeNull();
  });

  it('目标索引超界时夹紧到末尾', () => {
    const tasks = [t('a', 'todo', 100), t('b', 'doing', 100)];
    const [moved] = applyMove(tasks, 'a', 'doing', 99);
    expect(moved.sortOrder).toBe(200);
  });

  it('id 不存在时原样返回', () => {
    const tasks = [t('a', 'todo', 100)];
    expect(applyMove(tasks, 'nope', 'doing', 0)).toBe(tasks);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run src/features/tasks
```
Expected: FAIL。

- [ ] **Step 3: 实现**

`src/features/tasks/dnd.ts`：

```ts
import type { Task, TaskStatus } from '../../types';
import { fromDate } from '../../lib/format';

export const STATUSES: TaskStatus[] = ['todo', 'doing', 'done'];

export const STATUS_NAMES: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
};

/** 计算拖拽后的完整任务列表（纯函数）。目标列排除自身后，在 targetIndex 处取 sort_order。 */
export function applyMove(tasks: Task[], taskId: string, targetStatus: TaskStatus, targetIndex: number): Task[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return tasks;
  const column = tasks
    .filter((t) => t.status === targetStatus && t.id !== taskId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = Math.max(0, Math.min(targetIndex, column.length));
  const prev = idx > 0 ? column[idx - 1].sortOrder : null;
  const next = idx < column.length ? column[idx].sortOrder : null;
  const sortOrder =
    prev !== null && next !== null ? (prev + next) / 2
    : prev !== null ? prev + 100
    : next !== null ? next - 100
    : 100;
  return tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          status: targetStatus,
          sortOrder,
          doneAt: targetStatus === 'done' ? (t.doneAt ?? fromDate(new Date())) : null,
        }
      : t,
  );
}
```

`src/stores/tasks.ts` 的接口追加 move（加到 TaskState 与实现中）：

```ts
  move: (taskId: string, status: TaskStatus, index: number) => Promise<void>;
```

```ts
  move: async (taskId, status, index) => {
    const next = applyMove(get().tasks, taskId, status, index);
    if (next === get().tasks) return;
    set({ tasks: next });
    const changed = next.find((t) => t.id === taskId);
    if (changed) {
      try {
        await api.taskUpdate(changed);
      } catch (e) {
        useUiStore.getState().toast(`保存移动失败：${e}`, 'error');
        useTaskStore.getState().load();
      }
    }
  },
```
（顶部 import `applyMove` 与 `TaskStatus`。）

`src/features/tasks/TaskCard.tsx`：

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';
import { isOverdue } from '../../lib/format';

const PRIORITY_COLORS = ['#9ca3af', '#60a5fa', '#f59e0b', '#ef4444'];

export default function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="task-card"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={onClick}
    >
      <div className="task-card-title">{task.title}</div>
      <div className="task-card-meta">
        <span className="dot" style={{ background: PRIORITY_COLORS[task.priority] ?? '#9ca3af' }} />
        {task.dueAt && (
          <span className={isOverdue(task) ? 'due overdue' : 'due'}>
            {task.dueAt.slice(5, 16).replace('T', ' ')}
          </span>
        )}
      </div>
    </div>
  );
}
```

`src/features/tasks/TaskColumn.tsx`：

```tsx
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, TaskStatus } from '../../types';
import { STATUS_NAMES } from './dnd';
import TaskCard from './TaskCard';

export default function TaskColumn({
  status,
  tasks,
  onAdd,
  onOpen,
}: {
  status: TaskStatus;
  tasks: Task[];
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className={`kanban-col${isOver ? ' over' : ''}`}>
      <div className="kanban-col-head">
        <span>{STATUS_NAMES[status]}</span>
        <span className="kanban-count">{tasks.length}</span>
        <button className="btn" onClick={onAdd}>＋</button>
      </div>
      <div ref={setNodeRef} className="kanban-col-body">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onClick={() => onOpen(t.id)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
```

`src/features/tasks/KanbanPage.tsx`（覆盖占位）：

```tsx
import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';
import { applyMove, STATUSES } from './dnd';
import TaskColumn from './TaskColumn';

export default function KanbanPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const move = useTaskStore((s) => s.move);
  const openCreate = useUiStore((s) => s.openCreate);
  const openTask = useUiStore((s) => s.openTask);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [, force] = useState(0);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const targetStatus = (STATUSES as string[]).includes(overId)
      ? (overId as Task['status'])
      : tasks.find((t) => t.id === overId)?.status;
    if (!targetStatus) return;

    const column = tasks
      .filter((t) => t.status === targetStatus && t.id !== activeId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    let index: number;
    if (overId === targetStatus || !column.some((t) => t.id === overId)) {
      index = column.length;
    } else {
      const overIdx = column.findIndex((t) => t.id === overId);
      const moving = tasks.find((t) => t.id === activeId);
      index = moving && moving.sortOrder < column[overIdx].sortOrder ? overIdx + 1 : overIdx;
    }
    const next = applyMove(tasks, activeId, targetStatus, index);
    force((n) => n + 1);
    void move(activeId, targetStatus, index);
    void next;
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="kanban">
        {STATUSES.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={tasks
              .filter((t) => t.status === status)
              .sort((a, b) => a.sortOrder - b.sortOrder)}
            onAdd={() => openCreate(status)}
            onOpen={openTask}
          />
        ))}
      </div>
    </DndContext>
  );
}
```
（`useState force` 用于保持 dnd 状态新鲜，可忽略警告；实际实现时若冗余可去掉。）

`src/features/tasks/TaskDrawer.tsx`：

```tsx
import { useState } from 'react';
import { fromLocalInput, toLocalInput } from '../../lib/format';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';

const PRIORITY_OPTIONS = [
  { value: 0, label: '低' },
  { value: 1, label: '中' },
  { value: 2, label: '高' },
  { value: 3, label: '紧急' },
];

export default function TaskDrawer() {
  const drawer = useUiStore((s) => s.drawer)!;
  const { closeDrawer, toast } = useUiStore();
  const { tasks, create, update, remove } = useTaskStore();
  const editing = drawer.mode === 'edit' ? tasks.find((t) => t.id === drawer.taskId) : undefined;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [priority, setPriority] = useState(editing?.priority ?? 1);
  const [dueAt, setDueAt] = useState(toLocalInput(editing?.dueAt ?? null));
  const [status, setStatus] = useState(editing?.status ?? (drawer.mode === 'create' ? drawer.status : 'todo'));

  async function save() {
    if (!title.trim()) {
      toast('标题不能为空', 'error');
      return;
    }
    if (drawer.mode === 'create') {
      await create({ title: title.trim(), description, priority, dueAt: fromLocalInput(dueAt), status });
    } else if (editing) {
      await update({ ...editing, title: title.trim(), description, priority, dueAt: fromLocalInput(dueAt), status });
    }
    toast('已保存');
    closeDrawer();
  }

  async function del() {
    if (editing && window.confirm(`删除任务「${editing.title}」？`)) {
      await remove(editing.id);
      closeDrawer();
    }
  }

  return (
    <div className="overlay" onClick={closeDrawer}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h3>{drawer.mode === 'create' ? '新建任务' : '编辑任务'}</h3>
        <div className="field">
          <label>标题</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>描述</label>
          <textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>优先级</label>
          <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>截止时间</label>
          <input className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div className="field">
          <label>状态</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="todo">待办</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
          </select>
        </div>
        <div className="drawer-actions">
          <button className="btn primary" onClick={save}>保存</button>
          {drawer.mode === 'edit' && <button className="btn danger" onClick={del}>删除</button>}
          <button className="btn" onClick={closeDrawer}>取消</button>
        </div>
      </div>
    </div>
  );
}
```

`src/index.css` 追加：

```css
.kanban { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; height: 100%; }
.kanban-col { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; display: flex; flex-direction: column; min-height: 0; }
.kanban-col.over { border-color: var(--accent); }
.kanban-col-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.kanban-col-head span:first-child { font-weight: 600; }
.kanban-count { color: var(--muted); font-size: 12px; }
.kanban-col-head .btn { margin-left: auto; padding: 0 10px; }
.kanban-col-body { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.task-card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; cursor: grab; }
.task-card:active { cursor: grabbing; }
.task-card-title { margin-bottom: 6px; }
.task-card-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.due.overdue { color: var(--danger); }
```

- [ ] **Step 4: 测试 + 构建验证**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run && npm run build
```
Expected: dnd 测试 PASS；build 成功。

- [ ] **Step 5: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 任务看板三列拖拽与任务编辑抽屉"
```

---

### Task 7: 日历页（月历 + 当日详情）

**Files:**
- Create: `src/features/calendar/CalendarPage.tsx`（覆盖占位）、`src/features/calendar/DayPanel.tsx`、`src/features/calendar/selectors.ts`
- Test: `src/features/calendar/selectors.test.ts`

**Interfaces:**
- Consumes: `useEventStore`、`useTaskStore`、Task 4 的 `dateOf`。
- Produces: `eventsForDate(date, events)`、`tasksForDate(date, tasks)`（当日到期任务，未完成在前按时间排序）。

- [ ] **Step 1: 写失败测试**

`src/features/calendar/selectors.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { eventsForDate, tasksForDate } from './selectors';
import type { EventItem, Task } from '../../types';

const base = { boardId: 'default', description: '', priority: 1, sortOrder: 0, doneAt: null, createdAt: '', updatedAt: '' };

describe('selectors', () => {
  it('tasksForDate 按 dueAt 日期筛选并让未完成靠前', () => {
    const tasks = [
      { ...base, id: '1', title: '完成', status: 'done', dueAt: '2026-09-08T09:00:00' },
      { ...base, id: '2', title: '晚', status: 'todo', dueAt: '2026-09-08T18:00:00' },
      { ...base, id: '3', title: '早', status: 'todo', dueAt: '2026-09-08T08:00:00' },
      { ...base, id: '4', title: '别天', status: 'todo', dueAt: '2026-09-09T08:00:00' },
      { ...base, id: '5', title: '无期', status: 'todo', dueAt: null },
    ] as Task[];
    const got = tasksForDate('2026-09-08', tasks);
    expect(got.map((t) => t.id)).toEqual(['3', '2', '1']);
  });

  it('eventsForDate 按 timeStart 排序', () => {
    const events = [
      { id: 'b', title: '晚', date: '2026-09-08', timeStart: '16:00' },
      { id: 'a', title: '早', date: '2026-09-08', timeStart: '09:00' },
      { id: 'c', title: '全天', date: '2026-09-08', timeStart: null },
    ] as EventItem[];
    expect(eventsForDate('2026-09-08', events).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run src/features/calendar
```
Expected: FAIL。

- [ ] **Step 3: 实现**

`src/features/calendar/selectors.ts`：

```ts
import type { EventItem, Task } from '../../types';
import { dateOf } from '../../lib/format';

export function tasksForDate(date: string, tasks: Task[]): Task[] {
  return tasks
    .filter((t) => dateOf(t.dueAt) === date)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
    });
}

export function eventsForDate(date: string, events: EventItem[]): EventItem[] {
  return events
    .filter((e) => e.date === date)
    .sort((a, b) => (a.timeStart ?? '99:99').localeCompare(b.timeStart ?? '99:99'));
}
```

`src/features/calendar/CalendarPage.tsx`（覆盖占位）：

```tsx
import { useMemo, useState } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { dateOf, toDateStr } from '../../lib/format';
import { useEventStore } from '../../stores/events';
import { useTaskStore } from '../../stores/tasks';
import { eventsForDate, tasksForDate } from './selectors';
import DayPanel from './DayPanel';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateStr(new Date()));
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  function shiftMonth(delta: number) {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    setMonth(next);
    useEventStore.getState().loadMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="calendar-page">
      <div className="calendar panel">
        <div className="calendar-head">
          <button className="btn" onClick={() => shiftMonth(-1)}>‹</button>
          <span className="calendar-title">
            {month.getFullYear()} 年 {month.getMonth() + 1} 月
          </span>
          <button className="btn" onClick={() => shiftMonth(1)}>›</button>
        </div>
        <div className="calendar-grid">
          {WEEK_LABELS.map((w) => (
            <div key={w} className="calendar-week">{w}</div>
          ))}
          {days.map((d) => {
            const ds = toDateStr(d);
            const dayTasks = tasksForDate(ds, tasks);
            const dayEvents = eventsForDate(ds, events);
            const isToday = isSameDay(d, new Date());
            return (
              <div
                key={ds}
                className={[
                  'calendar-cell',
                  isSameMonth(d, month) ? '' : 'dim',
                  ds === selected ? 'selected' : '',
                ].join(' ')}
                onClick={() => setSelected(ds)}
              >
                <div className={`cell-num${isToday ? ' today' : ''}`}>{d.getDate()}</div>
                <div className="cell-dots">
                  {dayTasks.slice(0, 4).map((t) => (
                    <span key={t.id} className={`tdot p${t.priority}${t.status === 'done' ? ' done' : ''}`} />
                  ))}
                  {dayEvents.slice(0, 4).map((e) => (
                    <span key={e.id} className="edot" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <DayPanel date={selected} />
    </div>
  );
}
```
（`dateOf` 导入仅类型需要时删除。）

`src/features/calendar/DayPanel.tsx`：

```tsx
import { useState } from 'react';
import { dateOf, fromDate } from '../../lib/format';
import { useEventStore } from '../../stores/events';
import { useTaskStore } from '../../stores/tasks';
import { eventsForDate, tasksForDate } from './selectors';

export default function DayPanel({ date }: { date: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);
  const dayTasks = tasksForDate(date, tasks);
  const dayEvents = eventsForDate(date, events);

  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTime, setTaskTime] = useState('');

  async function addEvent() {
    if (!eventTitle.trim()) return;
    await useEventStore.getState().create({
      title: eventTitle.trim(),
      date,
      timeStart: eventStart || null,
      timeEnd: eventEnd || null,
    });
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    const dueAt = taskTime ? `${date}T${taskTime}:00` : `${date}T09:00:00`;
    await useTaskStore.getState().create({ title: taskTitle.trim(), dueAt });
    setTaskTitle('');
    setTaskTime('');
  }

  async function toggleTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const done = t.status !== 'done';
    await useTaskStore.getState().update({
      ...t,
      status: done ? 'done' : 'todo',
      doneAt: done ? fromDate(new Date()) : null,
    });
  }

  return (
    <div className="day-panel panel">
      <div className="day-panel-title">{date}</div>
      <section>
        <h4>日程</h4>
        {dayEvents.map((e) => (
          <div key={e.id} className="day-row">
            <span className="day-time">{e.timeStart ?? '全天'}</span>
            <span className="day-title">{e.title}</span>
            <button className="btn danger" onClick={() => useEventStore.getState().remove(e.id)}>删</button>
          </div>
        ))}
        {dayEvents.length === 0 && <div className="day-empty">暂无日程</div>}
        <div className="day-add">
          <input className="input" placeholder="日程标题" value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEvent()} />
          <div className="day-add-times">
            <input className="input" type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
            <input className="input" type="time" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
            <button className="btn primary" onClick={addEvent}>添加</button>
          </div>
        </div>
      </section>
      <section>
        <h4>到期任务</h4>
        {dayTasks.map((t) => (
          <div key={t.id} className="day-row">
            <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTask(t.id)} />
            <span className={`day-title${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
            <span className="day-time">{(t.dueAt ?? '').slice(11, 16)}</span>
          </div>
        ))}
        {dayTasks.length === 0 && <div className="day-empty">当天无到期任务</div>}
        <div className="day-add">
          <input className="input" placeholder="任务标题" value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()} />
          <div className="day-add-times">
            <input className="input" type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} />
            <button className="btn primary" onClick={addTask}>添加</button>
          </div>
        </div>
      </section>
    </div>
  );
}
```

`src/index.css` 追加：

```css
.calendar-page { display: grid; grid-template-columns: 1fr 340px; gap: 16px; height: 100%; }
.calendar { padding: 14px; display: flex; flex-direction: column; min-height: 0; }
.calendar-head { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 10px; }
.calendar-title { font-weight: 600; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; flex: 1; grid-auto-rows: 1fr; }
.calendar-week { text-align: center; color: var(--muted); padding: 4px 0; }
.calendar-cell { border: 1px solid transparent; border-radius: 8px; padding: 4px 6px; cursor: pointer; min-height: 56px; }
.calendar-cell:hover { background: var(--bg); }
.calendar-cell.dim .cell-num { color: var(--muted); opacity: .5; }
.calendar-cell.selected { border-color: var(--accent); background: var(--bg); }
.cell-num { font-size: 13px; }
.cell-num.today { color: var(--accent); font-weight: 700; }
.cell-dots { display: flex; gap: 3px; flex-wrap: wrap; margin-top: 4px; }
.tdot, .edot { width: 7px; height: 7px; border-radius: 50%; }
.tdot.p0 { background: #9ca3af; } .tdot.p1 { background: #60a5fa; }
.tdot.p2 { background: #f59e0b; } .tdot.p3 { background: #ef4444; }
.tdot.done { opacity: .35; }
.edot { background: var(--accent); }
.day-panel { padding: 16px; overflow-y: auto; }
.day-panel-title { font-weight: 600; margin-bottom: 8px; }
.day-panel h4 { margin: 12px 0 6px; font-size: 13px; color: var(--muted); }
.day-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px dashed var(--border); }
.day-title.done { text-decoration: line-through; color: var(--muted); }
.day-time { color: var(--muted); font-size: 12px; }
.day-row .btn { margin-left: auto; padding: 2px 8px; }
.day-empty { color: var(--muted); font-size: 12px; padding: 4px 0; }
.day-add { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.day-add-times { display: flex; gap: 6px; }
```

- [ ] **Step 4: 测试 + 构建验证**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run && npm run build
```
Expected: selectors 测试 PASS；build 成功。

- [ ] **Step 5: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 日历月历与当日详情面板（日程+到期任务同源展示）"
```

---

### Task 8: 快速面板（独立窗口 + 全局快捷键 + 自然语言日期）

**Files:**
- Create: `src/features/quick/parseQuickTask.ts`、`src/features/quick/QuickWindow.tsx`、`src/quick-main.tsx`、`quick.html`、`src-tauri/src/shortcut.rs`
- Modify: `src-tauri/src/lib.rs`（快捷键插件 + quick 窗口切换 + Notified 不在此任务）、`src-tauri/tauri.conf.json`（quick 窗口 + capabilities）、`src-tauri/Cargo.toml`（global-shortcut 插件）、`vite.config.ts`（多入口）、`package.json`（无）
- Test: `src/features/quick/parseQuickTask.test.ts`

**Interfaces:**
- Consumes: `api.taskCreate`、`api.taskList`、`api.eventListDate`、`toDateStr`。
- Produces: `parseQuickTask(raw, now?) -> { title, dueAt }`；事件 `quick://changed`（快速面板创建任务后广播）、`quick://open`（`{type:'task', id}`，主窗口打开任务抽屉）；全局 Alt+Space 切换 quick 窗口显示。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { parseQuickTask } from './parseQuickTask';

// 2026-09-07 是周一
const now = new Date('2026-09-07T10:00:00');

describe('parseQuickTask', () => {
  it('明天 + 时间', () => {
    const r = parseQuickTask('明天 15:00 开周会', now);
    expect(r.title).toBe('开周会');
    expect(r.dueAt).toBe('2026-09-08T15:00:00');
  });

  it('今天 无时间 → 09:00', () => {
    const r = parseQuickTask('今天 散步', now);
    expect(r.title).toBe('散步');
    expect(r.dueAt).toBe('2026-09-07T09:00:00');
  });

  it('后天', () => {
    const r = parseQuickTask('后天 交作业', now);
    expect(r.dueAt).toBe('2026-09-09T09:00:00');
  });

  it('周X → 下一个该星期（含未来本周）', () => {
    const r = parseQuickTask('周五 写周报', now);
    expect(r.dueAt).toBe('2026-09-11T09:00:00');
  });

  it('仅时间：未过 → 今天；已过 → 明天', () => {
    expect(parseQuickTask('14:30 站会', now).dueAt).toBe('2026-09-07T14:30:00');
    expect(parseQuickTask('08:00 晨跑', now).dueAt).toBe('2026-09-08T08:00:00');
  });

  it('X点 半点写法', () => {
    expect(parseQuickTask('下午3点 评审', now).dueAt).toBe('2026-09-07T15:00:00');
  });

  it('无日期短语 → dueAt 为 null', () => {
    const r = parseQuickTask('写周报', now);
    expect(r.title).toBe('写周报');
    expect(r.dueAt).toBeNull();
  });

  it('空输入', () => {
    expect(parseQuickTask('   ', now)).toEqual({ title: '', dueAt: null });
  });
});
```
注意「下午3点」若实现不含「下午」前缀规则则改用「3点 评审」→ 15:00；实现按 `(\d{1,2})[点:：](\d{1,2})?` 与 `半` 处理，「下午/晚上」等前缀不做偏移，测试数据避开歧义（用「3点」）。

- [ ] **Step 2: 运行确认失败**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run src/features/quick
```
Expected: FAIL。

- [ ] **Step 3: 实现解析器**

`src/features/quick/parseQuickTask.ts`：

```ts
export interface ParsedQuickTask {
  title: string;
  dueAt: string | null;
}

const WEEK: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const DAY_WORDS: Array<[string, number]> = [
  ['大后天', 3],
  ['后天', 2],
  ['明天', 1],
  ['今天', 0],
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/** 规则解析：今天/明天/后天/大后天/周X/星期X + HH:MM|X点半|X点。无匹配日期短语时 dueAt=null。 */
export function parseQuickTask(raw: string, now: Date = new Date()): ParsedQuickTask {
  let text = raw.trim();
  if (!text) return { title: '', dueAt: null };

  let datePart: Date | null = null;
  let timePart: [number, number] | null = null;

  for (const [word, delta] of DAY_WORDS) {
    const idx = text.indexOf(word);
    if (idx !== -1) {
      const d = new Date(now);
      d.setDate(d.getDate() + delta);
      datePart = d;
      text = text.replace(word, ' ');
      break;
    }
  }
  if (!datePart) {
    const m = text.match(/(?:周|星期|礼拜)([一二三四五六日天])/);
    if (m) {
      const target = WEEK[m[1]];
      const d = new Date(now);
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      d.setDate(d.getDate() + delta);
      datePart = d;
      text = text.replace(m[0], ' ');
    }
  }

  const tm = text.match(/(\d{1,2})[:：点](半|\d{1,2})?/);
  if (tm) {
    const h = Number(tm[1]);
    const min = tm[2] === '半' ? 30 : tm[2] ? Number(tm[2]) : 0;
    if (h >= 0 && h < 24 && min < 60) {
      timePart = [h, min];
      text = text.replace(tm[0], ' ');
    }
  }

  let dueAt: string | null = null;
  if (datePart && timePart) {
    datePart.setHours(timePart[0], timePart[1], 0, 0);
    dueAt = toIso(datePart);
  } else if (datePart) {
    datePart.setHours(9, 0, 0, 0);
    dueAt = toIso(datePart);
  } else if (timePart) {
    const candidate = new Date(now);
    candidate.setHours(timePart[0], timePart[1], 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    dueAt = toIso(candidate);
  }

  return { title: text.replace(/\s+/g, ' ').trim(), dueAt };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run src/features/quick
```
Expected: PASS。

- [ ] **Step 5: 实现 Rust 全局快捷键与 quick 窗口**

`src-tauri/Cargo.toml` 增加：

```toml
tauri-plugin-global-shortcut = "2"
```

`src-tauri/src/shortcut.rs`：

```rust
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

pub fn toggle_quick(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("quick") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.center();
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

pub fn handle(app: &tauri::AppHandle, _shortcut: &tauri_plugin_global_shortcut::Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    if event.state == ShortcutState::Pressed {
        toggle_quick(app);
    }
}
```

`src-tauri/src/lib.rs` 修改为：

```rust
mod backup;
mod commands;
mod db;
mod models;
mod shortcut;

use std::sync::Mutex;

pub struct Db(pub Mutex<rusqlite::Connection>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(shortcut::handle).build())
        .setup(|app| {
            let conn = db::init(app.handle())?;
            app.manage(Db(Mutex::new(conn)));
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                app.global_shortcut().register("alt+space")?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::task_list,
            commands::task_create,
            commands::task_update,
            commands::task_delete,
            commands::event_list_month,
            commands::event_list_date,
            commands::event_create,
            commands::event_update,
            commands::event_delete,
            commands::settings_all,
            commands::settings_set,
            commands::backup_export,
            commands::backup_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`src-tauri/tauri.conf.json` 的 `app.windows` 追加 quick 窗口：

```json
[
  {
    "label": "main",
    "title": "个人工作台",
    "width": 1200,
    "height": 800,
    "minWidth": 900,
    "minHeight": 600
  },
  {
    "label": "quick",
    "url": "quick.html",
    "title": "快速面板",
    "width": 560,
    "height": 380,
    "visible": false,
    "decorations": false,
    "alwaysOnTop": true,
    "skipTaskbar": true,
    "center": true
  }
]
```

`src-tauri/capabilities/default.json` 的 `permissions` 增加（若模板没有该文件则创建，`windows` 为 `["main", "quick"]`）：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "默认能力",
  "windows": ["main", "quick"],
  "permissions": [
    "core:default",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-set-focus",
    "core:window:allow-center",
    "dialog:default"
  ]
}
```

`quick.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>快速面板</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/quick-main.tsx"></script>
  </body>
</html>
```

`vite.config.ts` build 段改为：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        quick: resolve(__dirname, 'quick.html'),
      },
    },
  },
  test: { environment: 'jsdom', globals: true },
});
```
（保留原模板中其它必要字段，如 `envPrefix`。）

`src/quick-main.tsx`：

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import QuickWindow from './features/quick/QuickWindow';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QuickWindow />
  </React.StrictMode>,
);
```

`src/features/quick/QuickWindow.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from '../../lib/api';
import { toDateStr } from '../../lib/format';
import type { EventItem, Task } from '../../types';
import { parseQuickTask } from './parseQuickTask';

interface Hit {
  type: 'task' | 'event';
  id: string;
  label: string;
}

function search(q: string, tasks: Task[], events: EventItem[]): Hit[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const t = tasks.filter((x) => x.title.toLowerCase().includes(s)).map((x) => ({ type: 'task' as const, id: x.id, label: x.title }));
  const e = events.filter((x) => x.title.toLowerCase().includes(s)).map((x) => ({ type: 'event' as const, id: x.id, label: x.title }));
  return [...t, ...e].slice(0, 8);
}

export default function QuickWindow() {
  const [q, setQ] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sel, setSel] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.taskList().then(setTasks).catch(() => {});
    api.eventListDate(toDateStr(new Date())).then(setEvents).catch(() => {});
  }, []);

  const hits = useMemo(() => search(q, tasks, events), [q, tasks, events]);

  async function hide() {
    await getCurrentWindow().hide();
    setQ('');
    setSel(0);
    setNotice('');
  }

  async function openHit(hit: Hit) {
    await emit('quick://open', { type: hit.type, id: hit.id });
    await hide();
  }

  async function createTask() {
    const parsed = parseQuickTask(q);
    if (!parsed.title) return;
    try {
      await api.taskCreate({ title: parsed.title, dueAt: parsed.dueAt });
      await emit('quick://changed');
      setNotice(`已创建：${parsed.title}`);
      setTimeout(() => void hide(), 900);
    } catch (e) {
      setNotice(`创建失败：${e}`);
    }
  }

  async function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      await hide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      if (hits[sel]) await openHit(hits[sel]);
      else await createTask();
    }
  }

  return (
    <div className="quick">
      <input
        className="quick-input"
        autoFocus
        placeholder="搜索或输入任务（支持：明天 15:00 / 周五 / 14:30）"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="quick-results">
        {hits.map((h, i) => (
          <div
            key={`${h.type}-${h.id}`}
            className={`quick-item${i === sel ? ' active' : ''}`}
            onClick={() => void openHit(h)}
          >
            <span className="quick-tag">{h.type === 'task' ? '任务' : '日程'}</span>
            {h.label}
          </div>
        ))}
        {hits.length === 0 && q.trim() !== '' && !notice && (
          <div className="quick-hint">回车创建任务：{parseQuickTask(q).title}</div>
        )}
        {notice && <div className="quick-hint">{notice}</div>}
      </div>
    </div>
  );
}
```

`src/index.css` 追加：

```css
.quick { padding: 12px; display: flex; flex-direction: column; gap: 10px; height: 100vh; background: var(--panel); }
.quick-input { padding: 12px 14px; font-size: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); outline: none; }
.quick-input:focus { border-color: var(--accent); }
.quick-results { overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.quick-item { padding: 8px 10px; border-radius: 8px; cursor: pointer; display: flex; gap: 8px; align-items: center; }
.quick-item.active { background: var(--bg); }
.quick-tag { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
.quick-hint { color: var(--muted); padding: 8px 10px; }
```

- [ ] **Step 6: 编译与测试验证**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run && npm run build && cd src-tauri && cargo check
```
Expected: 全部通过。若 `register("alt+space")` API 签名不符，按编译错误改用 `register_shortcut` 或字符串解析形式。

- [ ] **Step 7: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 全局 Alt+Space 快速面板（搜索/回车建任务/自然语言日期）"
```

---

### Task 9: 到期提醒引擎

**Files:**
- Create: `src-tauri/src/reminders.rs`
- Modify: `src-tauri/src/lib.rs`（Notified 状态 + reminders::start）、`src-tauri/Cargo.toml`（tauri-plugin-notification）
- Test: `src-tauri/src/reminders.rs` 内 `#[cfg(test)]`（due_tasks 查询）

**Interfaces:**
- Consumes: `Db`、tasks 表。
- Produces: `reminders::due_tasks(conn, now, window_secs) -> Vec<(id, title)>`（纯查询，可测）；后台线程每 30 秒扫描一次，命中即发系统通知且同一任务只提醒一次（Notified 集合）。

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TASK_INSERT;
    use rusqlite::params;

    #[test]
    fn due_tasks_finds_recently_due_ignores_old_and_future() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        let insert = |id: &str, due: Option<&str>, status: &str| {
            c.execute(TASK_INSERT, params![id, "default", id, "", status, 1, due, 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        };
        insert("recent", Some("2026-09-07T10:00:30"), "todo");   // 窗口内
        insert("old", Some("2026-09-07T09:00:00"), "todo");     // 太旧（>60s）
        insert("future", Some("2026-09-07T18:00:00"), "todo");  // 未来
        insert("done", Some("2026-09-07T10:00:30"), "done");    // 已完成
        insert("nodue", None, "todo");                          // 无截止

        let got = due_tasks(&c, "2026-09-07T10:01:00", 60).unwrap();
        let ids: Vec<&str> = got.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids, vec!["recent"]);
    }
}
```

- [ ] **Step 2: 运行确认失败**

```bash
cd "/d/Desktop/Personal Workstation/src-tauri" && cargo test reminders
```
Expected: 编译失败（reminders 模块不存在）。

- [ ] **Step 3: 实现**

`src-tauri/src/reminders.rs`：

```rust
use crate::{Db, Notified};
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::time::Duration;
use tauri::{Manager, State};
use tauri_plugin_notification::NotificationExt;

pub fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

/** 查询最近 window_secs 秒内到期、未完成的任务（now 为本地 naive ISO 字符串，可直接比较）。 */
pub fn due_tasks(conn: &Connection, now: &str, window_secs: i64) -> rusqlite::Result<Vec<(String, String)>> {
    let window_start = minus_seconds(now, window_secs);
    let mut stmt = conn.prepare(
        "SELECT id, title FROM tasks
         WHERE status != 'done' AND due_at IS NOT NULL AND due_at <= ?1 AND due_at > ?2",
    )?;
    stmt.query_map(params![now, window_start], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?
    .collect()
}

fn minus_seconds(s: &str, secs: i64) -> String {
    use chrono::NaiveDateTime;
    match NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        Ok(t) => (t - chrono::Duration::seconds(secs)).format("%Y-%m-%dT%H:%M:%S").to_string(),
        Err(_) => s.to_string(),
    }
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        if let Err(e) = tick(&app) {
            println!("提醒扫描失败：{e}");
        }
        std::thread::sleep(Duration::from_secs(30));
    });
}

fn tick(app: &tauri::AppHandle) -> anyhow::Result<()> {
    let now = now_str();
    let db: State<Db> = app.state();
    let notified: State<Notified> = app.state();
    let conn = db.0.lock().map_err(|e| anyhow::anyhow!(e.to_string()))?;
    let due = due_tasks(&conn, &now, 60)?;
    drop(conn);

    let mut set = notified.0.lock().unwrap();
    for (id, title) in due {
        if set.contains(&id) {
            continue;
        }
        app.notification()
            .builder()
            .title("任务到期")
            .body(&title)
            .show()?;
        set.insert(id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TASK_INSERT;
    use rusqlite::params;

    #[test]
    fn due_tasks_finds_recently_due_ignores_old_and_future() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        let insert = |id: &str, due: Option<&str>, status: &str| {
            c.execute(TASK_INSERT, params![id, "default", id, "", status, 1, due, 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        };
        insert("recent", Some("2026-09-07T10:00:30"), "todo");
        insert("old", Some("2026-09-07T09:00:00"), "todo");
        insert("future", Some("2026-09-07T18:00:00"), "todo");
        insert("done", Some("2026-09-07T10:00:30"), "done");
        insert("nodue", None, "todo");

        let got = due_tasks(&c, "2026-09-07T10:01:00", 60).unwrap();
        let ids: Vec<&str> = got.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids, vec!["recent"]);
    }
}
```

`lib.rs` 修改：`mod reminders;`、状态 `pub struct Notified(pub Mutex<HashSet<String>>);`，setup 中：

```rust
app.manage(Notified(Mutex::new(std::collections::HashSet::new())));
reminders::start(app.handle().clone());
```

`Cargo.toml` 增加 `tauri-plugin-notification = "2"`，`lib.rs` Builder 链加 `.plugin(tauri_plugin_notification::init())`。

- [ ] **Step 4: 测试确认通过**

```bash
cd "/d/Desktop/Personal Workstation/src-tauri" && cargo test
```
Expected: 全部 ok。

- [ ] **Step 5: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 任务到期提醒引擎（30 秒轮询 + 系统通知 + 去重）"
```

---

### Task 10: 设置页（模块管理 + 主题 + 备份）

**Files:**
- Create: `src/features/settings/SettingsPage.tsx`
- Modify: `src/App.tsx`（activePage==='settings' 时渲染设置页）

**Interfaces:**
- Consumes: `MODULES`、`useSettingsStore`、`api.backupExport/backupImport`、`@tauri-apps/plugin-dialog` 的 `save/open/confirm`、`useUiStore.toast`。
- Produces: 设置页（三区块：模块管理/外观/备份）。

- [ ] **Step 1: 实现**

`src/features/settings/SettingsPage.tsx`：

```tsx
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { api } from '../../lib/api';
import type { ThemeMode } from '../../lib/theme';
import { MODULES } from '../../modules/registry';
import { useEventStore } from '../../stores/events';
import { useSettingsStore } from '../../stores/settings';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export default function SettingsPage() {
  const { enabledModules, theme, setEnabled, setTheme } = useSettingsStore();
  const toast = useUiStore((s) => s.toast);

  async function exportBackup() {
    const path = await save({
      title: '导出备份',
      defaultPath: 'workstation-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return;
    try {
      await api.backupExport(path);
      toast(`已导出到 ${path}`);
    } catch (e) {
      toast(`导出失败：${e}`, 'error');
    }
  }

  async function importBackup() {
    const ok = await confirm('导入备份将覆盖当前全部数据，继续？', { title: '导入备份' });
    if (!ok) return;
    const path = await open({
      title: '选择备份文件',
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return;
    try {
      const n = await api.backupImport(path);
      await useSettingsStore.getState().load();
      await useTaskStore.getState().load();
      await useEventStore.getState().loadMonth();
      toast(`导入完成，共 ${n} 条`);
    } catch (e) {
      toast(`导入失败：${e}`, 'error');
    }
  }

  return (
    <div className="settings">
      <section className="panel settings-card">
        <h3>模块管理</h3>
        {MODULES.map((m) => (
          <label key={m.id} className="settings-row">
            <span>
              <b>{m.name}</b>
              <small>{m.description}</small>
            </span>
            <input
              type="checkbox"
              checked={enabledModules.includes(m.id)}
              onChange={(e) => void setEnabled(m.id, e.target.checked)}
            />
          </label>
        ))}
      </section>
      <section className="panel settings-card">
        <h3>外观</h3>
        <div className="settings-row">
          <span>主题</span>
          <select className="input" value={theme} onChange={(e) => void setTheme(e.target.value as ThemeMode)} style={{ width: 140 }}>
            {THEME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </section>
      <section className="panel settings-card">
        <h3>备份</h3>
        <p className="muted">数据保存在本机。导出为 JSON 文件；导入会整库替换当前数据。</p>
        <div className="settings-actions">
          <button className="btn" onClick={exportBackup}>导出备份…</button>
          <button className="btn" onClick={importBackup}>导入备份…</button>
        </div>
      </section>
    </div>
  );
}
```

`src/App.tsx` 内容区改为：

```tsx
<div className="content">
  {activePage === 'settings' ? (
    <SettingsPage />
  ) : Page ? (
    <Page />
  ) : (
    <div className="empty">请先在设置中启用至少一个模块</div>
  )}
</div>
```
（顶部 `import SettingsPage from './features/settings/SettingsPage';`）

`src/index.css` 追加：

```css
.settings { max-width: 720px; display: flex; flex-direction: column; gap: 16px; }
.settings-card { padding: 16px 20px; }
.settings-card h3 { margin: 0 0 10px; }
.settings-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--border); }
.settings-row small { display: block; color: var(--muted); }
.settings-actions { display: flex; gap: 8px; }
.muted { color: var(--muted); }
```

- [ ] **Step 2: 构建验证**

```bash
cd "/d/Desktop/Personal Workstation" && npm run build
```
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "feat: 设置页（模块开关/主题三档/备份导入导出）"
```

---

### Task 11: 端到端验证与收尾

**Files:**
- Create: `README.md`
- Modify: 无（验证与修复为主）

**Interfaces:**
- Consumes: 全部前序任务。
- Produces: 可运行 `npm run tauri dev` 的完整应用；README；已知问题清单。

- [ ] **Step 1: 全量自动化测试**

```bash
cd "/d/Desktop/Personal Workstation" && npx vitest run && cd src-tauri && cargo test
```
Expected: 全部 PASS。

- [ ] **Step 2: 启动开发模式进行手动验收**

```bash
cd "/d/Desktop/Personal Workstation" && npm run tauri dev
```

手动验收清单（逐项确认）：
1. 主窗口启动无报错，侧边栏显示「任务看板/日历/设置」。
2. 看板：＋新建任务（含截止时间）→ 卡片出现；拖拽跨列 → 状态变化且刷新后仍在；拖入已完成显示完成态。
3. 日历：有任务的日期出现彩点；点日期右侧显示当天日程+到期任务；添加日程/任务即时出现。
4. Alt+Space 弹出快速面板：搜索命中回车打开主窗口；输入「明天 15:00 测试提醒」回车 → 主窗口任务列表出现该任务。
5. 通知：把「测试提醒」的截止时间改成 1 分钟后 → 等待弹出 Windows 通知。
6. 设置：关闭「日历」模块 → 侧边栏立即消失；主题切深色/浅色/跟随系统即时生效。
7. 备份：导出 JSON → 删几个任务 → 导入 → 数据恢复一致；导入损坏文件报错且数据不变。

- [ ] **Step 3: 写 README**

`README.md`：

```markdown
# 个人工作台（Personal Workstation）

Windows 桌面个人工作台：任务看板 + 日历日程，模块化架构，数据全本地。

## 功能

- **任务看板**：待办/进行中/已完成三列，拖拽换状态、列内排序，优先级与截止时间，过期标红。
- **日历**：月历圆点标记（任务=优先级色，日程=蓝），当日详情面板就地增改日程与任务。
- **快速面板**：全局 `Alt+Space` 呼出；搜索任务/日程；直接输入文字回车即建任务，支持「明天 15:00」「周五」「14:30」「3点半」等日期短语。
- **到期提醒**：任务到期弹 Windows 系统通知（应用后台运行也可）。
- **模块化**：设置页可开关模块；新增模块 = `src/features/` 新目录 + `src/modules/registry.ts` 注册一行。
- **数据与备份**：SQLite 本地存储（`%APPDATA%/personal-workstation/app.db`），设置页一键导出/导入 JSON 备份。
- **主题**：跟随系统 / 浅色 / 深色。

## 开发

```bash
npm install
npm run tauri dev    # 开发模式
npm run tauri build  # 产出安装包（src-tauri/target/release/bundle）
npx vitest run       # 前端测试
cd src-tauri && cargo test  # 后端测试
```

## 技术栈

Tauri 2 · React 18 · TypeScript · Zustand · dnd-kit · date-fns · rusqlite · Vitest

设计文档：`docs/superpowers/specs/2026-09-07-personal-workstation-design.md`
```

- [ ] **Step 4: 提交**

```bash
cd "/d/Desktop/Personal Workstation" && git add -A && git commit -m "docs: README 与验收记录"
```

---

## 已知简化（与 spec 的偏差，已在实现中记录）

1. **提醒机制**：spec 写「定时器+每日兜底」，实现为 30 秒轮询（行为等价且更稳健：到期 1 分钟窗口内必触发、重启后不会补发旧任务）。同一任务只提醒一次（内存集合）。
2. **通知点击唤起主窗口**：tauri-plugin-notification 桌面端点击回调平台支持有限，MVP 不实现点击跳转；通过 Alt+Space 或任务栏进入。
3. **日历双击新建**：由「点选日期后右栏新增表单自动聚焦」等效替代。
4. **路由**：模块切换用 Zustand 状态而非 react-router（桌面单窗口场景足够），`Module.route` 字段保留以兼容 spec。
