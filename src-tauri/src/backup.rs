use crate::models::*;
use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::Path;

pub const VERSION: i64 = 2;

pub fn export(conn: &Connection, path: &Path) -> Result<()> {
    let tasks = query_all_tasks(conn)?;
    let settings = query_all_settings(conn)?;
    let doc = json!({
        "version": VERSION,
        "exportedAt": crate::commands::now_iso(),
        "tasks": tasks,
        "settings": settings,
    });
    std::fs::write(path, serde_json::to_vec_pretty(&doc)?)?;
    Ok(())
}

pub fn import(conn: &mut Connection, path: &Path) -> Result<usize> {
    let text = std::fs::read_to_string(path).with_context(|| "无法读取备份文件")?;
    let doc: Value = serde_json::from_str(&text).with_context(|| "备份文件不是合法 JSON")?;
    let version = doc
        .get("version")
        .and_then(|v| v.as_i64())
        .context("备份缺少 version 字段")?;
    if version > VERSION {
        bail!("不支持的备份版本（当前支持 version<= {VERSION}）");
    }
    let tasks: Vec<Task> = serde_json::from_value(doc.get("tasks").cloned().unwrap_or_default())
        .context("tasks 字段缺失或格式错误")?;
    let settings: Vec<SettingRow> =
        serde_json::from_value(doc.get("settings").cloned().unwrap_or_default())
            .context("settings 字段缺失或格式错误")?;

    // v1 备份中的日程转换为任务（due_at = date + time_start，缺省 09:00）。
    let mut converted: Vec<Task> = Vec::new();
    if version == 1 {
        let events: Vec<Value> = doc
            .get("events")
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default();
        for e in events {
            let id = e
                .get("id")
                .and_then(|v| v.as_str())
                .context("events 条目缺少 id")?
                .to_string();
            let title = e
                .get("title")
                .and_then(|v| v.as_str())
                .context("events 条目缺少 title")?
                .to_string();
            let date = e
                .get("date")
                .and_then(|v| v.as_str())
                .context("events 条目缺少 date")?
                .to_string();
            let time_start = e
                .get("timeStart")
                .or_else(|| e.get("time_start"))
                .and_then(|v| v.as_str());
            let created = e
                .get("createdAt")
                .or_else(|| e.get("created_at"))
                .and_then(|v| v.as_str())
                .unwrap_or("2026-01-01T00:00:00")
                .to_string();
            let due_at = match time_start {
                Some(t) => {
                    let t = if t.len() == 5 { format!("{t}:00") } else { t.to_string() };
                    format!("{date}T{t}")
                }
                None => format!("{date}T09:00:00"),
            };
            converted.push(Task {
                id,
                board_id: "default".into(),
                title,
                description: String::new(),
                status: "todo".into(),
                priority: 1,
                due_at: Some(due_at),
                sort_order: 100.0,
                done_at: None,
                created_at: created.clone(),
                updated_at: created,
            });
        }
    }

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tasks", [])?;
    tx.execute("DELETE FROM settings", [])?;
    for t in tasks.iter().chain(converted.iter()) {
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
    for s in &settings {
        tx.execute(SETTING_INSERT, params![s.key, s.value])?;
    }
    tx.commit()?;
    Ok(tasks.len() + converted.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{query_all_settings, query_all_tasks, SETTING_INSERT, TASK_INSERT};
    use rusqlite::params;

    fn mem() -> rusqlite::Connection {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        c
    }

    fn seed(c: &rusqlite::Connection) {
        c.execute(TASK_INSERT, params!["t1", "default", "任务A", "", "todo", 1, "2026-09-08T10:00:00", 100.0, None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        c.execute(SETTING_INSERT, params!["theme", "\"dark\""]).unwrap();
    }

    #[test]
    fn export_then_import_roundtrip_v2() {
        let src = mem();
        seed(&src);
        let file = std::env::temp_dir().join(format!("ws-bk2-{}.json", std::process::id()));
        export(&src, &file).unwrap();

        let mut dst = mem();
        let n = import(&mut dst, &file).unwrap();
        assert_eq!(n, 1);
        assert_eq!(query_all_tasks(&dst).unwrap().len(), 1);
        assert_eq!(query_all_settings(&dst).unwrap().len(), 1);

        let text = std::fs::read_to_string(&file).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["version"], 2);
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_v1_converts_events_to_tasks() {
        let file = std::env::temp_dir().join(format!("ws-bk1-{}.json", std::process::id()));
        std::fs::write(
            &file,
            r#"{
              "version": 1,
              "tasks": [
                {"id":"t1","boardId":"default","title":"旧任务","description":"","status":"todo","priority":1,"dueAt":"2026-09-08T10:00:00","sortOrder":100,"doneAt":null,"createdAt":"2026-09-07T09:00:00","updatedAt":"2026-09-07T09:00:00"}
              ],
              "events": [
                {"id":"e1","title":"周会","date":"2026-09-08","timeStart":"15:00","timeEnd":"16:00","note":"","createdAt":"2026-09-07T09:00:00"},
                {"id":"e2","title":"全天事项","date":"2026-09-09","timeStart":null,"timeEnd":null,"note":"","createdAt":"2026-09-07T09:00:00"}
              ],
              "settings": []
            }"#,
        )
        .unwrap();

        let mut c = mem();
        let n = import(&mut c, &file).unwrap();
        assert_eq!(n, 3);
        let tasks = query_all_tasks(&c).unwrap();
        assert_eq!(tasks.len(), 3);
        let ev1 = tasks.iter().find(|t| t.id == "e1").unwrap();
        assert_eq!(ev1.due_at.as_deref(), Some("2026-09-08T15:00:00"));
        let ev2 = tasks.iter().find(|t| t.id == "e2").unwrap();
        assert_eq!(ev2.due_at.as_deref(), Some("2026-09-09T09:00:00"));
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_rejects_future_version_and_zero_writes() {
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
