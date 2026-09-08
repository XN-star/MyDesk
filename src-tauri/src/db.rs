use rusqlite::Connection;

/// v3 建表语句（新库直接为此形态）：tasks 含 remind_minutes_before。
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
    conn.pragma_update(None, "journal_mode", "WAL")?;
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        // 全新库：直接建 v3 形态。
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
            conn.execute_batch(SCHEMA_V3)?;
        }
        conn.pragma_update(None, "user_version", 3)?;
    } else if version == 1 {
        migrate_v1_to_v2(conn)?;
        upgrade_to_v3(conn)?;
        conn.pragma_update(None, "user_version", 3)?;
    } else if version == 2 {
        upgrade_to_v3(conn)?;
        conn.pragma_update(None, "user_version", 3)?;
    }
    Ok(())
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

    fn mem() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn fresh_db_creates_tasks_with_remind_col_at_v3() {
        let c = mem();
        let n: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','settings')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 2);
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 3);
        assert!(column_exists(&c, "tasks", "remind_minutes_before").unwrap());
    }

    #[test]
    fn migrate_is_idempotent() {
        let c = mem();
        migrate(&c).unwrap();
        migrate(&c).unwrap();
    }

    #[test]
    fn v1_db_migrates_events_into_tasks_then_v3() {
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
        assert_eq!(v, 3);
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
    fn v2_db_upgrades_to_v3() {
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
        assert_eq!(v, 3);
        let kept: String = c
            .query_row("SELECT title FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "旧任务");
        let remind: Option<i64> = c
            .query_row("SELECT remind_minutes_before FROM tasks WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(remind, None, "迁移后的旧任务默认不提醒");
    }
}
