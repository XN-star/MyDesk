use crate::models::*;
use crate::Db;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

type DbState<'a> = State<'a, Db>;

pub fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn with_conn<T>(
    db: DbState,
    f: impl FnOnce(&Connection) -> rusqlite::Result<T>,
) -> Result<T, String> {
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
            remind_minutes_before: input.remind_minutes_before,
            created_at: now.clone(),
            updated_at: now,
        };
        c.execute(
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
                t.created_at,
                t.updated_at
            ],
        )?;
        Ok(t)
    })
}

#[tauri::command]
pub fn task_update(db: DbState, task: Task) -> Result<Task, String> {
    with_conn(db, move |c| {
        c.execute(
            "UPDATE tasks SET board_id=?2, title=?3, description=?4, status=?5, priority=?6, due_at=?7, sort_order=?8, done_at=?9, remind_minutes_before=?10, updated_at=?11 WHERE id=?1",
            params![
                task.id,
                task.board_id,
                task.title,
                task.description,
                task.status,
                task.priority,
                task.due_at,
                task.sort_order,
                task.done_at,
                task.remind_minutes_before,
                now_iso()
            ],
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
        let now = now_iso();
        c.execute(
            "UPDATE notes SET title=?2, content=?3, pinned=?4, updated_at=?5 WHERE id=?1",
            params![note.id, note.title, note.content, note.pinned, now],
        )?;
        Ok(Note { updated_at: now, ..note })
    })
}

#[tauri::command]
pub fn note_delete(db: DbState, id: String) -> Result<(), String> {
    with_conn(db, move |c| {
        c.execute("DELETE FROM notes WHERE id=?1", params![id])?;
        Ok(())
    })
}

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

/// 用系统默认方式打开网址或路径（url/path 通用）。
#[tauri::command]
pub fn link_open(kind: String, target: String) -> Result<(), String> {
    println!("[link_open] kind={kind} target={target}");
    match kind.as_str() {
        "url" => {
            std::process::Command::new("cmd")
                .args(["/C", "start", "", &target])
                .spawn()
                .map_err(|e| format!("打开网址失败：{e}"))?;
            Ok(())
        }
        "path" => {
            std::process::Command::new("cmd")
                .args(["/C", "start", "", &target])
                .spawn()
                .map_err(|e| format!("打开路径失败：{e}"))?;
            Ok(())
        }
        _ => Err(format!("不支持的类型：{kind}")),
    }
}

/// 仅 command 类型：本机执行用户自己配置的命令（单机个人应用，风险自担）。
#[tauri::command]
pub fn link_run(db: DbState, id: String) -> Result<(), String> {
    let (kind, target) = with_conn(db, move |c| {
        c.query_row(
            "SELECT kind, target FROM links WHERE id=?1",
            params![id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
    })?;
    if kind != "command" {
        return Err("仅命令类型可执行".into());
    }
    std::process::Command::new("cmd")
        .args(["/C", &target])
        .spawn()
        .map_err(|e| format!("命令执行失败：{e}"))?;
    Ok(())
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

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    #[allow(unreachable_code)]
    Ok(())
}

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
