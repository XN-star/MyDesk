use rusqlite::Connection;

/// v6 建表语句（新库直接为此形态）：tasks + notes + links + boards。
pub const SCHEMA_V6: &str = "
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
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

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

/// v7 建表语句（新库直接为此形态）：v6 全部 + habits + habit_logs；tasks 含 repeat 列。
pub const SCHEMA_V7: &str = "
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
  repeat      TEXT,
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
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  frequency  TEXT NOT NULL DEFAULT 'daily',
  reminder   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id       TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date     TEXT NOT NULL,
  value    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id, date);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v6→v7：新增 habits/habit_logs 表与 tasks.repeat 列。
pub const MIGRATE_V7: &str = "
CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  frequency  TEXT NOT NULL DEFAULT 'daily',
  reminder   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id       TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date     TEXT NOT NULL,
  value    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id, date);
";

/// v9 建表语句（新库直接为此形态）：v8 全部 + FTS5 全局搜索索引与同步触发器。
pub const SCHEMA_V9: &str = "
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
  repeat      TEXT,
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
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  frequency  TEXT NOT NULL DEFAULT 'daily',
  reminder   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id       TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date     TEXT NOT NULL,
  value    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id, date);
CREATE TABLE IF NOT EXISTS time_entries (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries (task_id, started_at);
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  kind,
  ref_id,
  title,
  body,
  tokenize = 'unicode61'
);
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('task', new.id, cjk_space(new.title), cjk_space(new.description));
END;
CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'task', old.id, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'task', old.id, old.title, old.description);
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('task', new.id, cjk_space(new.title), cjk_space(new.description));
END;
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('note', new.id, cjk_space(new.title), cjk_space(new.content));
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'note', old.id, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'note', old.id, old.title, old.content);
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('note', new.id, cjk_space(new.title), cjk_space(new.content));
END;
CREATE TRIGGER IF NOT EXISTS links_ai AFTER INSERT ON links BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('link', new.id, cjk_space(new.title), cjk_space(new.target));
END;
CREATE TRIGGER IF NOT EXISTS links_ad AFTER DELETE ON links BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'link', old.id, old.title, old.target);
END;
CREATE TRIGGER IF NOT EXISTS links_au AFTER UPDATE ON links BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'link', old.id, old.title, old.target);
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('link', new.id, cjk_space(new.title), cjk_space(new.target));
END;
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v8→v9：FTS 索引 + 触发器 + 存量数据回填。
pub const MIGRATE_V9: &str = "
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  kind,
  ref_id,
  title,
  body,
  tokenize = 'unicode61'
);
INSERT INTO search_index(kind, ref_id, title, body) SELECT 'task', id, cjk_space(title), cjk_space(description) FROM tasks;
INSERT INTO search_index(kind, ref_id, title, body) SELECT 'note', id, cjk_space(title), cjk_space(content) FROM notes;
INSERT INTO search_index(kind, ref_id, title, body) SELECT 'link', id, cjk_space(title), cjk_space(target) FROM links;
";

/// 触发器定义（v8→v9 与备份导入重建共用；CREATE TRIGGER IF NOT EXISTS 幂等）。
pub const SEARCH_TRIGGERS: &str = "
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('task', new.id, cjk_space(new.title), cjk_space(new.description));
END;
CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'task', old.id, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'task', old.id, old.title, old.description);
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('task', new.id, cjk_space(new.title), cjk_space(new.description));
END;
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('note', new.id, cjk_space(new.title), cjk_space(new.content));
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'note', old.id, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'note', old.id, old.title, old.content);
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('note', new.id, cjk_space(new.title), cjk_space(new.content));
END;
CREATE TRIGGER IF NOT EXISTS links_ai AFTER INSERT ON links BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('link', new.id, cjk_space(new.title), cjk_space(new.target));
END;
CREATE TRIGGER IF NOT EXISTS links_ad AFTER DELETE ON links BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'link', old.id, old.title, old.target);
END;
CREATE TRIGGER IF NOT EXISTS links_au AFTER UPDATE ON links BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'link', old.id, old.title, old.target);
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('link', new.id, cjk_space(new.title), cjk_space(new.target));
END;
";

/// v8 建表语句，仅用于迁移测试中构造 v8 库。
pub const SCHEMA_V8: &str = "
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
  repeat      TEXT,
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
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  frequency  TEXT NOT NULL DEFAULT 'daily',
  reminder   TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS habit_logs (
  id       TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date     TEXT NOT NULL,
  value    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs (habit_id, date);
CREATE TABLE IF NOT EXISTS time_entries (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries (task_id, started_at);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v7→v8：新增 time_entries 表。
pub const MIGRATE_V8: &str = "
CREATE TABLE IF NOT EXISTS time_entries (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries (task_id, started_at);
";

/// v6 建表语句，仅用于迁移测试中构造 v6 库。
pub const SCHEMA_V6_FULL: &str = "
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
CREATE TABLE IF NOT EXISTS boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v5 建表语句，仅用于迁移测试中构造 v5 库。
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

/// v3 建表语句，仅用于迁移测试中构造 v3 库。
pub const SCHEMA_V3: &str = "
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
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v2→v3：tasks 增加 remind_minutes_before（NULL=不提醒，0=准点）。
pub const MIGRATE_V2_TO_V3: &str = "ALTER TABLE tasks ADD COLUMN remind_minutes_before INTEGER;";

/// v2 的建表语句，仅用于迁移测试中构造旧库。
pub const SCHEMA_V2: &str = "
CREATE TABLE tasks (
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
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
";

/// v1 的建表语句，仅用于迁移测试中构造旧库。
pub const SCHEMA_V1: &str = "
CREATE TABLE tasks (
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
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  date        TEXT NOT NULL,
  time_start  TEXT,
  time_end    TEXT,
  note        TEXT DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE TABLE settings (
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
    register_cjk_space(conn)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        // 全新库：直接建 v9 形态。
        // version==0 且已存在 events/tasks 表的极端情况（手动建的 v1/v2 库）按旧版处理。
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
            conn.execute_batch(SCHEMA_V9)?;
            seed_default_board(conn)?;
            conn.pragma_update(None, "user_version", 9)?;
            return Ok(());
        }
    } else if version == 1 {
        migrate_v1_to_v2(conn)?;
        upgrade_to_v3(conn)?;
    } else if version == 2 {
        upgrade_to_v3(conn)?;
    }
    upgrade_to_v4(conn)?;
    upgrade_to_v5(conn)?;
    upgrade_to_v6(conn)?;
    upgrade_to_v7(conn)?;
    upgrade_to_v8(conn)?;
    upgrade_to_v9(conn)?;
    conn.pragma_update(None, "user_version", 9)?;
    Ok(())
}

/// 种下默认看板（幂等）。
pub fn seed_default_board(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO boards (id, name, created_at, updated_at) VALUES ('default', '默认看板', '2026-09-09T00:00:00', '2026-09-09T00:00:00')",
        [],
    )?;
    Ok(())
}

fn upgrade_to_v4(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "notes")? {
        conn.execute_batch(MIGRATE_V3_TO_V4)?;
    }
    Ok(())
}

fn upgrade_to_v5(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "links")? {
        conn.execute_batch(MIGRATE_V5)?;
    }
    Ok(())
}

fn upgrade_to_v6(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "boards")? {
        conn.execute_batch(MIGRATE_V6)?;
    } else {
        seed_default_board(conn)?;
    }
    Ok(())
}

fn upgrade_to_v7(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "habits")? {
        conn.execute_batch(MIGRATE_V7)?;
    }
    if !column_exists(conn, "tasks", "repeat")? {
        conn.execute_batch("ALTER TABLE tasks ADD COLUMN repeat TEXT;")?;
    }
    Ok(())
}

fn upgrade_to_v8(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "time_entries")? {
        conn.execute_batch(MIGRATE_V8)?;
    }
    Ok(())
}

fn upgrade_to_v9(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "search_index")? {
        conn.execute_batch(MIGRATE_V9)?;
        conn.execute_batch(SEARCH_TRIGGERS)?;
    }
    Ok(())
}

/// 注册 cjk_space 标量函数：连续 CJK 字符间插入空格。
/// FTS5 unicode61 不切分中文（整句成一条 token），索引与查询两侧都经此变换，
/// 实现「按字子串匹配」——搜「预算」能命中「讨论了预算」。
pub fn register_cjk_space(conn: &Connection) -> rusqlite::Result<()> {
    conn.create_scalar_function(
        "cjk_space",
        1,
        rusqlite::functions::FunctionFlags::SQLITE_UTF8 | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let text: String = ctx.get(0)?;
            let mut out = String::with_capacity(text.len() * 2);
            let mut prev_cjk = false;
            for ch in text.chars() {
                let is_cjk = is_cjk_char(ch);
                if is_cjk && prev_cjk {
                    out.push(' ');
                }
                out.push(ch);
                prev_cjk = is_cjk;
            }
            Ok(out)
        },
    )
}

fn is_cjk_char(c: char) -> bool {
    matches!(c as u32,
        0x4E00..=0x9FFF    // CJK 基本区
        | 0x3400..=0x4DBF  // 扩展 A
        | 0x3040..=0x30FF  // 平假名/片假名
        | 0xAC00..=0xD7AF  // 谚文
        | 0xF900..=0xFAFF  // 兼容表意
    )
}

fn upgrade_to_v3(conn: &Connection) -> rusqlite::Result<()> {
    if !column_exists(conn, "tasks", "remind_minutes_before")? {
        conn.execute_batch(MIGRATE_V2_TO_V3)?;
    }
    Ok(())
}

fn table_exists(conn: &Connection, name: &str) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
        [name],
        |r| r.get::<_, i64>(0),
    )?;
    Ok(n > 0)
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name='{column}'"
        ),
        [],
        |r| r.get::<_, i64>(0),
    )?;
    Ok(n > 0)
}

fn migrate_v1_to_v2(conn: &Connection) -> rusqlite::Result<()> {
    // 日程并入任务：date + time_start 组成 due_at，无时刻的日程落在当天 09:00。
    conn.execute_batch(
        "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, created_at, updated_at)
         SELECT id, 'default', title, '', 'todo', 1,
                date || 'T' || COALESCE(time_start, '09:00') || ':00',
                100.0 * ROWID, NULL, created_at, created_at
         FROM events;
         DROP TABLE events;",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn mem() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn fresh_db_creates_all_tables_at_v6() {
        let c = mem();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','settings','notes','links','boards')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 5);
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        assert!(column_exists(&c, "tasks", "remind_minutes_before").unwrap());
        assert!(column_exists(&c, "notes", "pinned").unwrap());
        assert!(column_exists(&c, "links", "target").unwrap());
    }

    #[test]
    fn migrate_is_idempotent() {
        let c = mem();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
    }

    #[test]
    fn v1_db_migrates_events_into_tasks_then_v6() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V1).unwrap();
        c.execute_batch("PRAGMA user_version = 1;").unwrap();
        c.execute(
            "INSERT INTO events (id, title, date, time_start, time_end, note, created_at) VALUES ('e1', '周会', '2026-09-08', '15:00', '16:00', '', '2026-09-07T09:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        let events: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='events'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(events, 0, "events 表应被删除");
        let due: String = c
            .query_row("SELECT due_at FROM tasks WHERE id='e1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(due, "2026-09-08T15:00:00");
        assert!(column_exists(&c, "tasks", "remind_minutes_before").unwrap());
    }

    #[test]
    fn v2_db_upgrades_to_v6() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V2).unwrap();
        c.execute_batch("PRAGMA user_version = 2;").unwrap();
        c.execute(
            "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, created_at, updated_at) VALUES ('t1', 'default', '旧任务', '', 'todo', 1, '2026-09-09T10:00:00', 100.0, NULL, '2026-09-07T09:00:00', '2026-09-07T09:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        let kept: String = c
            .query_row("SELECT title FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "旧任务");
        let remind: Option<i64> = c
            .query_row("SELECT remind_minutes_before FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(remind, None, "迁移后的旧任务默认不提醒");
    }

    #[test]
    fn v3_db_upgrades_to_v6_keeps_tasks() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V3).unwrap();
        c.execute_batch("PRAGMA user_version = 3;").unwrap();
        c.execute(
            "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, created_at, updated_at) VALUES ('t1', 'default', '旧任务', '', 'todo', 1, '2026-09-09T10:00:00', 100.0, NULL, 0, '2026-09-07T09:00:00', '2026-09-07T09:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        let kept: String = c
            .query_row("SELECT title FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "旧任务");
        assert!(table_exists(&c, "notes").unwrap());
    }

    #[test]
    fn v4_db_upgrades_to_v6_keeps_data() {
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
        assert_eq!(v, 9);
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
        assert_eq!(v, 9);
        let name: String = c
            .query_row("SELECT name FROM boards WHERE id='default'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "默认看板");
        let kept: String = c
            .query_row("SELECT title FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "旧任务");
    }

    #[test]
    fn fresh_db_creates_all_tables_at_v7() {
        let c = mem();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','settings','notes','links','boards','habits','habit_logs')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 7);
        assert!(column_exists(&c, "tasks", "repeat").unwrap());
        assert!(column_exists(&c, "habits", "reminder").unwrap());
        assert!(column_exists(&c, "habit_logs", "value").unwrap());
    }

    #[test]
    fn fresh_db_creates_all_tables_at_v8() {
        let c = mem();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','settings','notes','links','boards','habits','habit_logs','time_entries')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 8);
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        assert!(column_exists(&c, "time_entries", "task_id").unwrap());
        assert!(column_exists(&c, "time_entries", "ended_at").unwrap());
    }

    #[test]
    fn v7_db_upgrades_to_v8_keeps_data() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V7).unwrap();
        c.execute_batch("PRAGMA user_version = 7;").unwrap();
        c.execute(
            "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, repeat, created_at, updated_at) VALUES ('t1', 'default', '旧任务', '', 'todo', 1, NULL, 100.0, NULL, 0, NULL, '2026-09-10T10:00:00', '2026-09-10T10:00:00')",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO habits (id, name, frequency, reminder, archived, created_at, updated_at) VALUES ('h1', '健身', 'daily', NULL, 0, '2026-09-10T10:00:00', '2026-09-10T10:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get::<_, i64>(0)).unwrap(),
            1
        );
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM habits", [], |r| r.get::<_, i64>(0)).unwrap(),
            1
        );
        assert!(table_exists(&c, "time_entries").unwrap());
    }

    #[test]
    fn fresh_db_creates_fts_at_v9() {
        let c = mem();
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        assert!(table_exists(&c, "search_index").unwrap());
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name IN ('tasks_ai','tasks_ad','tasks_au','notes_ai','notes_ad','notes_au','links_ai','links_ad','links_au')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 9, "三表各三个触发器");
    }

    #[test]
    fn v8_db_upgrades_to_v9_backfills_search_index() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V8).unwrap();
        c.execute_batch("PRAGMA user_version = 8;").unwrap();
        c.execute(TASK_INSERT_MIN, params!["t1", "预算讨论", ""]).unwrap();
        c.execute(
            "INSERT INTO notes (id, title, content, pinned, created_at, updated_at) VALUES ('n1', '会议记录', '讨论了预算', 0, '2026-09-10T10:00:00', '2026-09-10T10:00:00')",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO links (id, title, kind, target, sort_order, created_at, updated_at) VALUES ('l1', 'Gmail', 'url', 'https://mail.google.com', 100.0, '2026-09-10T10:00:00', '2026-09-10T10:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        // 回填后可命中存量数据（CJK 按字索引，"预算"二字连续即命中）
        let hits = crate::models::global_search(&c, "预算").unwrap();
        assert_eq!(hits.len(), 2, "任务与笔记均命中");
        let link_hits = crate::models::global_search(&c, "gmail").unwrap();
        assert_eq!(link_hits.len(), 1);
        assert_eq!(link_hits[0].kind, "link");
    }

    // v8 测试库用最小任务插入（SCHEMA_V8 无 repeat 之后的差异通过显式列规避）
    const TASK_INSERT_MIN: &str = "INSERT INTO tasks (id, title, description, board_id, status, priority, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, 'default', 'todo', 1, 100.0, '2026-09-10T10:00:00', '2026-09-10T10:00:00')";

    #[test]
    fn v6_db_upgrades_to_v7_keeps_data() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_V6_FULL).unwrap();
        c.execute_batch("PRAGMA user_version = 6;").unwrap();
        c.execute(
            "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, created_at, updated_at) VALUES ('t1', 'default', '旧任务', '', 'todo', 1, NULL, 100.0, NULL, 0, '2026-09-09T10:00:00', '2026-09-09T10:00:00')",
            [],
        )
        .unwrap();
        c.execute(
            "INSERT INTO boards (id, name, created_at, updated_at) VALUES ('b1', '工作', '2026-09-09T10:00:00', '2026-09-09T10:00:00')",
            [],
        )
        .unwrap();

        migrate(&c).unwrap();

        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 9);
        assert_eq!(
            c.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get::<_, i64>(0)).unwrap(),
            1
        );
        let repeat: Option<String> = c
            .query_row("SELECT repeat FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(repeat, None, "迁移后旧任务默认不重复");
        assert!(table_exists(&c, "habits").unwrap());
        assert!(table_exists(&c, "habit_logs").unwrap());
        let board: String = c
            .query_row("SELECT name FROM boards WHERE id='b1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(board, "工作");
    }
}
