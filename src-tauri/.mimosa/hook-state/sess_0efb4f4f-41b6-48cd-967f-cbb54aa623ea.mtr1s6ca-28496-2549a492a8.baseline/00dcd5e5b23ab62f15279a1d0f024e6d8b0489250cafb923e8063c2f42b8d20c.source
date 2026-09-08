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
    let doc: serde_json::Value =
        serde_json::from_str(&text).with_context(|| "备份文件不是合法 JSON")?;
    if doc.get("version").and_then(|v| v.as_i64()) != Some(VERSION) {
        bail!("不支持的备份版本（需要 version={VERSION}）");
    }
    let tasks: Vec<Task> = serde_json::from_value(doc.get("tasks").cloned().unwrap_or_default())
        .context("tasks 字段缺失或格式错误")?;
    let events: Vec<EventItem> =
        serde_json::from_value(doc.get("events").cloned().unwrap_or_default())
            .context("events 字段缺失或格式错误")?;
    let settings: Vec<SettingRow> =
        serde_json::from_value(doc.get("settings").cloned().unwrap_or_default())
            .context("settings 字段缺失或格式错误")?;

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tasks", [])?;
    tx.execute("DELETE FROM events", [])?;
    tx.execute("DELETE FROM settings", [])?;
    for t in &tasks {
        tx.execute(
            TASK_INSERT,
            params![
                t.id,
                t.board_id,
                t.title,
                t.description,
                t.status,
                t.priority,
                t.due_at,
                t.sort_order,
                t.done_at,
                t.created_at,
                t.updated_at
            ],
        )?;
    }
    for e in &events {
        tx.execute(
            EVENT_INSERT,
            params![e.id, e.title, e.date, e.time_start, e.time_end, e.note, e.created_at],
        )?;
    }
    for s in &settings {
        tx.execute(SETTING_INSERT, params![s.key, s.value])?;
    }
    tx.commit()?;
    Ok(tasks.len() + events.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{query_all_settings, query_all_tasks, EVENT_INSERT, SETTING_INSERT, TASK_INSERT};
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
        let file =
            std::env::temp_dir().join(format!("ws-bk-{}.json", std::process::id()));
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
        let file =
            std::env::temp_dir().join(format!("ws-bk-bad-{}.json", std::process::id()));
        std::fs::write(&file, r#"{"version": 99, "tasks": []}"#).unwrap();
        let mut c = mem();
        c.execute(TASK_INSERT, params!["keep", "default", "保留", "", "todo", 1, None::<String>, 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let err = import(&mut c, &file).unwrap_err();
        assert!(err.to_string().contains("不支持的备份版本"));
        assert_eq!(
            query_all_tasks(&c).unwrap().len(),
            1,
            "校验失败必须零写入"
        );
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_rejects_broken_json() {
        let file =
            std::env::temp_dir().join(format!("ws-bk-broken-{}.json", std::process::id()));
        std::fs::write(&file, "{oops").unwrap();
        let mut c = mem();
        assert!(import(&mut c, &file).is_err());
        std::fs::remove_file(&file).ok();
    }
}
