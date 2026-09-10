use crate::models::*;
use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::Path;

pub const VERSION: i64 = 6;

pub fn export(conn: &Connection, path: &Path) -> Result<()> {
    let tasks = query_all_tasks(conn)?;
    let notes = query_all_notes(conn)?;
    let links = query_all_links(conn)?;
    let boards = query_all_boards(conn)?;
    let settings = query_all_settings(conn)?;
    let doc = json!({
        "version": VERSION,
        "exportedAt": crate::commands::now_iso(),
        "tasks": tasks,
        "notes": notes,
        "links": links,
        "boards": boards,
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
    // 旧版备份无 remindMinutesBefore 字段，统一补为「准点提醒」。
    let tasks: Vec<Task> = tasks
        .into_iter()
        .map(|mut t| {
            if t.remind_minutes_before.is_none() && t.due_at.is_some() {
                t.remind_minutes_before = Some(0);
            }
            t
        })
        .collect();
    let settings: Vec<SettingRow> =
        serde_json::from_value(doc.get("settings").cloned().unwrap_or_default())
            .context("settings 字段缺失或格式错误")?;
    // v1–v3 备份没有 notes 字段，视为空（整库替换语义）。
    let notes: Vec<Note> = match doc.get("notes") {
        Some(v) => serde_json::from_value(v.clone()).context("notes 字段格式错误")?,
        None => Vec::new(),
    };
    // v1–v4 备份没有 links 字段，视为空（整库替换语义）。
    let links: Vec<Link> = match doc.get("links") {
        Some(v) => serde_json::from_value(v.clone()).context("links 字段格式错误")?,
        None => Vec::new(),
    };
    // v1–v5 备份没有 boards 字段，视为空（导入后补种子 default）。
    let boards: Vec<Board> = match doc.get("boards") {
        Some(v) => serde_json::from_value(v.clone()).context("boards 字段格式错误")?,
        None => Vec::new(),
    };

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
                remind_minutes_before: Some(0),
                repeat: None,
                created_at: created.clone(),
                updated_at: created,
            });
        }
    }

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tasks", [])?;
    tx.execute("DELETE FROM notes", [])?;
    tx.execute("DELETE FROM links", [])?;
    tx.execute("DELETE FROM boards", [])?;
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
                t.remind_minutes_before,
                t.repeat,
                t.created_at,
                t.updated_at
            ],
        )?;
    }
    for n in &notes {
        tx.execute(
            NOTE_INSERT,
            params![n.id, n.title, n.content, n.pinned, n.created_at, n.updated_at],
        )?;
    }
    for l in &links {
        tx.execute(
            LINK_INSERT,
            params![l.id, l.title, l.kind, l.target, l.sort_order, l.created_at, l.updated_at],
        )?;
    }
    for b in &boards {
        tx.execute(BOARD_INSERT, params![b.id, b.name, b.created_at, b.updated_at])?;
    }
    // 任何备份导入后保证 default 看板存在
    tx.execute(
        "INSERT OR IGNORE INTO boards (id, name, created_at, updated_at) VALUES ('default', '默认看板', '2026-09-09T00:00:00', '2026-09-09T00:00:00')",
        [],
    )?;
    for s in &settings {
        tx.execute(SETTING_INSERT, params![s.key, s.value])?;
    }
    tx.commit()?;
    Ok(tasks.len() + converted.len() + notes.len() + links.len())
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
        c.execute(TASK_INSERT, params!["t1", "default", "任务A", "", "todo", 1, "2026-09-08T10:00:00", 100.0, None::<String>, Some(0), None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        c.execute(SETTING_INSERT, params!["theme", "\"dark\""]).unwrap();
    }

    #[test]
    fn export_then_import_roundtrip() {
        let src = mem();
        seed(&src);
        let file = std::env::temp_dir().join(format!("ws-bk3-{}.json", std::process::id()));
        export(&src, &file).unwrap();

        let mut dst = mem();
        let n = import(&mut dst, &file).unwrap();
        assert_eq!(n, 1);
        assert_eq!(query_all_tasks(&dst).unwrap().len(), 1);
        assert_eq!(query_all_settings(&dst).unwrap().len(), 1);

        let text = std::fs::read_to_string(&file).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(doc["version"], 6);
        std::fs::remove_file(&file).ok();
    }

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
        assert_eq!(doc["version"], 6);
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
        assert_eq!(
            crate::models::query_all_notes(&c).unwrap().len(),
            0,
            "旧备份无 notes，整库替换后为空"
        );
        std::fs::remove_file(&file).ok();
    }

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
        assert_eq!(doc["version"], 6);
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
        assert_eq!(
            crate::models::query_all_links(&c).unwrap().len(),
            0,
            "旧备份无 links，整库替换后为空"
        );
        std::fs::remove_file(&file).ok();
    }

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

    #[test]
    fn export_import_preserves_remind_field() {
        let src = mem();
        src.execute(TASK_INSERT, params!["t2", "default", "提前提醒任务", "", "todo", 1, "2026-09-08T10:00:00", 100.0, None::<String>, Some(30), None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let file = std::env::temp_dir().join(format!("ws-bk-remind-{}.json", std::process::id()));
        export(&src, &file).unwrap();
        let mut dst = mem();
        import(&mut dst, &file).unwrap();
        let t = query_all_tasks(&dst).unwrap();
        assert_eq!(t[0].remind_minutes_before, Some(30));
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
        assert_eq!(ev1.remind_minutes_before, Some(0), "v1 转换默认准点提醒");
        let ev2 = tasks.iter().find(|t| t.id == "e2").unwrap();
        assert_eq!(ev2.due_at.as_deref(), Some("2026-09-09T09:00:00"));
        std::fs::remove_file(&file).ok();
    }

    #[test]
    fn import_rejects_future_version_and_zero_writes() {
        let file = std::env::temp_dir().join(format!("ws-bk-bad-{}.json", std::process::id()));
        std::fs::write(&file, r#"{"version": 99, "tasks": []}"#).unwrap();
        let mut c = mem();
        c.execute(TASK_INSERT, params!["keep", "default", "保留", "", "todo", 1, None::<String>, 100.0, None::<String>, Some(0), None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
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
