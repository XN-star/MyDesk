use crate::models::*;
use crate::Db;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use tauri::{Manager, State};
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
            board_id: input.board_id.unwrap_or_else(|| "default".into()),
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            due_at: input.due_at,
            sort_order: max + 100.0,
            done_at: None,
            remind_minutes_before: input.remind_minutes_before,
            repeat: input.repeat,
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
                t.repeat,
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
            "UPDATE tasks SET board_id=?2, title=?3, description=?4, status=?5, priority=?6, due_at=?7, sort_order=?8, done_at=?9, remind_minutes_before=?10, repeat=?11, updated_at=?12 WHERE id=?1",
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
                task.repeat,
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
pub fn board_list(db: DbState) -> Result<Vec<Board>, String> {
    with_conn(db, query_all_boards)
}

#[tauri::command]
pub fn board_create(db: DbState, input: BoardInput) -> Result<Board, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let b = Board {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            created_at: now.clone(),
            updated_at: now,
        };
        c.execute(BOARD_INSERT, params![b.id, b.name, b.created_at, b.updated_at])?;
        Ok(b)
    })
}

#[tauri::command]
pub fn board_rename(db: DbState, id: String, name: String) -> Result<Board, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        c.execute(
            "UPDATE boards SET name=?2, updated_at=?3 WHERE id=?1",
            params![id, name, now],
        )?;
        Ok(Board { name, updated_at: now, ..query_one_board(c, &id)? })
    })
}

#[tauri::command]
pub fn board_delete(db: DbState, id: String) -> Result<(), String> {
    if id == "default" {
        return Err("默认看板不能删除".into());
    }
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tasks WHERE board_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM boards WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
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
pub fn habit_list(db: DbState) -> Result<Vec<Habit>, String> {
    with_conn(db, query_all_habits)
}

#[tauri::command]
pub fn habit_create(db: DbState, input: HabitInput) -> Result<Habit, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let h = Habit {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            frequency: input.frequency,
            reminder: input.reminder,
            archived: false,
            created_at: now.clone(),
            updated_at: now,
        };
        c.execute(
            HABIT_INSERT,
            params![h.id, h.name, h.frequency, h.reminder, h.archived, h.created_at, h.updated_at],
        )?;
        Ok(h)
    })
}

#[tauri::command]
pub fn habit_update(db: DbState, habit: Habit) -> Result<Habit, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        c.execute(
            "UPDATE habits SET name=?2, frequency=?3, reminder=?4, archived=?5, updated_at=?6 WHERE id=?1",
            params![habit.id, habit.name, habit.frequency, habit.reminder, habit.archived, now],
        )?;
        Ok(Habit { updated_at: now, ..habit })
    })
}

#[tauri::command]
pub fn habit_delete(db: DbState, id: String) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM habit_logs WHERE habit_id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM habits WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// 打卡切换：当日已打卡则删除日志（返回 None），否则插入 value=1（返回该日志）。
#[tauri::command]
pub fn habit_toggle(db: DbState, id: String, date: String) -> Result<Option<HabitLog>, String> {
    let now = now_iso();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT id FROM habit_logs WHERE habit_id=?1 AND date=?2",
            params![id, date],
            |r| r.get(0),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
        .map_err(|e: rusqlite::Error| e.to_string())?;
    let result = match existing {
        Some(log_id) => {
            tx.execute("DELETE FROM habit_logs WHERE id=?1", params![log_id])
                .map_err(|e| e.to_string())?;
            None
        }
        None => {
            let log = HabitLog {
                id: Uuid::new_v4().to_string(),
                habit_id: id,
                date,
                value: 1,
            };
            tx.execute(
                HABIT_LOG_INSERT,
                params![log.id, log.habit_id, log.date, log.value],
            )
            .map_err(|e| e.to_string())?;
            Some(log)
        }
    };
    tx.commit().map_err(|e| e.to_string())?;
    let _ = now;
    Ok(result)
}

#[tauri::command]
pub fn habit_logs(db: DbState, from: String, to: String) -> Result<Vec<HabitLog>, String> {
    with_conn(db, move |c| query_logs_between(c, &from, &to))
}

/// 开始计时：已存在进行中条目则先自动停止（同一时间只允许一个计时）。
#[tauri::command]
pub fn timer_start(db: DbState, task_id: String) -> Result<TimeEntry, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let exists: i64 = c.query_row(
            "SELECT COUNT(*) FROM tasks WHERE id=?1",
            params![task_id],
            |r| r.get(0),
        )?;
        if exists == 0 {
            return Err(rusqlite::Error::InvalidParameterName("任务不存在".into()));
        }
        c.execute(
            "UPDATE time_entries SET ended_at=?1 WHERE ended_at IS NULL",
            params![now],
        )?;
        let entry = TimeEntry {
            id: Uuid::new_v4().to_string(),
            task_id,
            started_at: now,
            ended_at: None,
        };
        c.execute(
            TIME_ENTRY_INSERT,
            params![entry.id, entry.task_id, entry.started_at, entry.ended_at],
        )?;
        Ok(entry)
    })
}

/// 停止当前计时；无进行中返回 None。
#[tauri::command]
pub fn timer_stop(db: DbState) -> Result<Option<TimeEntry>, String> {
    let now = now_iso();
    with_conn(db, move |c| {
        let running = query_running_entry(c)?;
        match running {
            Some(e) => {
                c.execute(
                    "UPDATE time_entries SET ended_at=?2 WHERE id=?1",
                    params![e.id, now],
                )?;
                Ok(Some(TimeEntry { ended_at: Some(now), ..e }))
            }
            None => Ok(None),
        }
    })
}

/// 当前计时状态（含任务标题与已计秒数）；空闲返回 None。
#[tauri::command]
pub fn timer_status(db: DbState) -> Result<Option<RunningTimer>, String> {
    with_conn(db, |c| {
        let running = query_running_entry(c)?;
        match running {
            Some(entry) => {
                let title: String = c
                    .query_row(
                        "SELECT title FROM tasks WHERE id=?1",
                        params![entry.task_id],
                        |r| r.get(0),
                    )
                    .unwrap_or_default();
                let elapsed = crate::reminders::parse_naive(&entry.started_at)
                    .map(|t| (chrono::Local::now().naive_local() - t).num_seconds().max(0))
                    .unwrap_or(0);
                Ok(Some(RunningTimer { entry, task_title: title, elapsed_sec: elapsed }))
            }
            None => Ok(None),
        }
    })
}

#[tauri::command]
pub fn time_entries(db: DbState, from: String, to: String) -> Result<Vec<TimeEntry>, String> {
    with_conn(db, move |c| query_entries_between(c, &from, &to))
}

/// 番茄钟档位（分钟），存 settings。
#[tauri::command]
pub fn pomodoro_set(db: DbState, focus_min: i64, break_min: i64) -> Result<(), String> {
    with_conn(db, move |c| {
        for (k, v) in [("pomodoroFocus", focus_min), ("pomodoroBreak", break_min)] {
            c.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=?2",
                params![k, v.to_string()],
            )?;
        }
        Ok(())
    })
}

/// 开启番茄（可绑定当前计时任务；无任务时仅跑钟）。从 settings 读档位（默认 25/5）。
#[tauri::command]
pub fn pomodoro_start(app: tauri::AppHandle, task_id: Option<String>) -> Result<(), String> {
    let focus_min: i64 = settings_get(&app, "pomodoroFocus").unwrap_or(25);
    let break_min: i64 = settings_get(&app, "pomodoroBreak").unwrap_or(5);
    let state: tauri::State<crate::timer::TimerState> = app.state();
    *state.task_id.lock().map_err(|e| e.to_string())? = task_id;
    *state.pomodoro.lock().map_err(|e| e.to_string())? =
        Some(crate::timer::Pomodoro::new(focus_min, break_min));
    state.active.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn pomodoro_stop(app: tauri::AppHandle) -> Result<(), String> {
    let state: tauri::State<crate::timer::TimerState> = app.state();
    state.active.store(false, std::sync::atomic::Ordering::Relaxed);
    *state.pomodoro.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

fn settings_get(app: &tauri::AppHandle, key: &str) -> Option<i64> {
    let db: tauri::State<Db> = app.state();
    let conn = db.0.lock().ok()?;
    let v: String = conn
        .query_row("SELECT value FROM settings WHERE key=?1", params![key], |r| r.get(0))
        .ok()?;
    v.parse().ok()
}

#[tauri::command]
pub fn global_search(db: DbState, query: String) -> Result<Vec<SearchHit>, String> {
    with_conn(db, move |c| crate::models::global_search(c, &query))
}

#[tauri::command]
pub fn related_notes(db: DbState, id: String) -> Result<Vec<Note>, String> {
    with_conn(db, move |c| crate::models::related_notes(c, &id))
}

/// 小组件数据：今日未完成任务（按到期升序，最多 5）、下一次提醒、最近 3 条笔记。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetData {
    pub today_tasks: Vec<Task>,
    pub next_reminder: Option<Task>,
    pub recent_notes: Vec<Note>,
}

#[tauri::command]
pub fn widget_data(db: DbState) -> Result<WidgetData, String> {
    with_conn(db, |c| {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let today_tasks: Vec<Task> = {
            let mut stmt = c.prepare(
                "SELECT id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, repeat, created_at, updated_at FROM tasks WHERE status != 'done' AND due_at IS NOT NULL AND substr(due_at, 1, 10) <= ?1 ORDER BY due_at LIMIT 5",
            )?;
            let rows = stmt.query_map([], task_from_row)?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let next_reminder: Option<Task> = {
            let mut stmt = c.prepare(
                "SELECT id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, repeat, created_at, updated_at FROM tasks WHERE status != 'done' AND due_at IS NOT NULL AND due_at >= ?2 AND remind_minutes_before IS NOT NULL ORDER BY due_at LIMIT 1",
            )?;
            let now = now_iso();
            let mut rows = stmt.query_map(params![today, now], task_from_row)?;
            rows.next().transpose()?
        };
        let recent_notes = query_all_notes(c)?;
        Ok(WidgetData {
            today_tasks,
            next_reminder,
            recent_notes: recent_notes.into_iter().take(3).collect(),
        })
    })
}

/// 显示小组件并定位到主屏工作区右下角。
#[tauri::command]
pub fn widget_show(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let win = app
        .get_webview_window("widget")
        .ok_or("widget 窗口不存在")?;
    if let Some(monitor) = win.current_monitor().map_err(|e| e.to_string())? {
        let size = win.outer_size().map_err(|e| e.to_string())?;
        let ma = monitor.position();
        let ms = monitor.size();
        let scale = monitor.scale_factor();
        let x = ma.x + ms.width as i32 - size.width as i32 - (8.0 * scale) as i32;
        let y = ma.y + ms.height as i32 - size.height as i32 - (48.0 * scale) as i32;
        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    }
    win.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn widget_hide(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let win = app
        .get_webview_window("widget")
        .ok_or("widget 窗口不存在")?;
    win.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_all(db: DbState) -> Result<HashMap<String, String>, String> {    with_conn(db, |c| {
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
