use crate::{Db, Notified};
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::time::Duration;
use tauri::{Manager, State};
use tauri_plugin_notification::NotificationExt;

pub fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

/// 查询最近 window_secs 秒内到期、未完成的任务（本地 naive ISO 字符串可直接比较）。
pub fn due_tasks(
    conn: &Connection,
    now: &str,
    window_secs: i64,
) -> rusqlite::Result<Vec<(String, String)>> {
    let window_start = minus_seconds(now, window_secs);
    let mut stmt = conn.prepare(
        "SELECT id, title FROM tasks
         WHERE status != 'done' AND due_at IS NOT NULL AND due_at <= ?1 AND due_at > ?2",
    )?;
    let rows = stmt.query_map(params![now, window_start], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    rows.collect()
}

fn minus_seconds(s: &str, secs: i64) -> String {
    use chrono::NaiveDateTime;
    match NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        Ok(t) => (t - chrono::Duration::seconds(secs))
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string(),
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
    let conn = db
        .0
        .lock()
        .map_err(|e| anyhow::anyhow!(e.to_string()))?;
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
