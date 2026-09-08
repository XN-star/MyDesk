use crate::{Db, Notified};
use chrono::NaiveDateTime;
use rusqlite::{params, Connection};
use std::time::Duration;
use tauri::{Manager, State};
use tauri_plugin_notification::NotificationExt;

pub const FMT: &str = "%Y-%m-%dT%H:%M:%S";

pub fn now_str() -> String {
    chrono::Local::now().format(FMT).to_string()
}

/// 提醒触发时刻 = due_at − remind_minutes_before。
/// 查询触发时刻落在 (now-window, now] 窗口内、未完成的任务。
pub fn due_tasks(
    conn: &Connection,
    now: &str,
    window_secs: i64,
) -> rusqlite::Result<Vec<(String, String, i64)>> {
    let window_start = parse_naive(now)
        .map(|t| (t - chrono::Duration::seconds(window_secs)).format(FMT).to_string())
        .unwrap_or_else(|| now.to_string());
    let mut stmt = conn.prepare(
        "SELECT id, title, due_at, remind_minutes_before FROM tasks
         WHERE status != 'done' AND due_at IS NOT NULL AND remind_minutes_before IS NOT NULL",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
        ))
    })?;
    let mut due = Vec::new();
    for row in rows {
        let (id, title, due_at, remind) = row?;
        if let Some(trigger) = trigger_at(&due_at, remind) {
            if trigger.as_str() <= now && trigger.as_str() > window_start.as_str() {
                due.push((id, title, remind));
            }
        }
    }
    Ok(due)
}

/// 解析 due_at 并减去提前量，返回触发时刻字符串；解析失败返回 None。
fn trigger_at(due_at: &str, remind_minutes: i64) -> Option<String> {
    let t = parse_naive(due_at)?;
    Some(
        (t - chrono::Duration::minutes(remind_minutes))
            .format(FMT)
            .to_string(),
    )
}

fn parse_naive(s: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(s, FMT).ok()
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
    for (id, title, remind) in due {
        if set.contains(&id) {
            continue;
        }
        let prefix = if remind > 0 {
            format!("（提前 {}）", remind_label(remind))
        } else {
            String::new()
        };
        app.notification()
            .builder()
            .title(format!("任务提醒{prefix}"))
            .body(&title)
            .show()?;
        set.insert(id);
    }
    Ok(())
}

fn remind_label(mins: i64) -> String {
    if mins % 1440 == 0 && mins >= 1440 {
        format!("{}天", mins / 1440)
    } else if mins % 60 == 0 && mins >= 60 {
        format!("{}小时", mins / 60)
    } else {
        format!("{mins}分钟")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TASK_INSERT;
    use rusqlite::params;

    fn mem() -> rusqlite::Connection {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        c
    }

    #[test]
    fn due_tasks_respects_remind_lead_time() {
        let c = mem();
        let insert = |id: &str, due: &str, remind: Option<i64>, status: &str| {
            c.execute(TASK_INSERT, params![id, "default", id, "", status, 1, due, 100.0, None::<String>, remind, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        };
        // due 10:00，提前 15 分钟 → 触发时刻 09:45
        insert("lead", "2026-09-07T10:00:00", Some(15), "todo");
        // due 10:00，准点 → 触发时刻 10:00
        insert("punctual", "2026-09-07T10:00:00", Some(0), "todo");
        // due 10:00，不提醒 → 永不触发
        insert("silent", "2026-09-07T10:00:00", None, "todo");
        // 提前 15 分钟但已完成
        insert("done", "2026-09-07T10:00:00", Some(15), "done");

        // 09:44:59：lead 尚未触发
        let got = due_tasks(&c, "2026-09-07T09:44:59", 60).unwrap();
        assert_eq!(got.len(), 0);

        // 09:45:10：lead 进入窗口
        let got = due_tasks(&c, "2026-09-07T09:45:10", 60).unwrap();
        assert_eq!(got.iter().map(|(id, _, _)| id.as_str()).collect::<Vec<_>>(), vec!["lead"]);

        // 10:00:10：punctual 进入窗口；lead 已过窗口不再返回（只提醒一次语义）
        let got = due_tasks(&c, "2026-09-07T10:00:10", 60).unwrap();
        assert_eq!(
            got.iter().map(|(id, _, _)| id.as_str()).collect::<Vec<_>>(),
            vec!["punctual"]
        );
    }

    #[test]
    fn due_tasks_one_day_lead() {
        let c = mem();
        c.execute(TASK_INSERT, params!["d1", "default", "明天的事", "", "todo", 1, "2026-09-08T10:00:00", 100.0, None::<String>, Some(1440), "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let got = due_tasks(&c, "2026-09-07T10:00:30", 60).unwrap();
        assert_eq!(got.len(), 1, "提前1天=昨天10:00 触发");
    }

    #[test]
    fn remind_label_format() {
        assert_eq!(remind_label(5), "5分钟");
        assert_eq!(remind_label(60), "1小时");
        assert_eq!(remind_label(1440), "1天");
        assert_eq!(remind_label(90), "90分钟");
    }

    #[test]
    fn due_tasks_bad_due_at_ignored() {
        let c = mem();
        c.execute(TASK_INSERT, params!["bad", "default", "坏时间", "", "todo", 1, "not-a-date", 100.0, None::<String>, Some(5), "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        assert!(due_tasks(&c, "2026-09-07T10:00:00", 60).unwrap().is_empty());
    }
}
