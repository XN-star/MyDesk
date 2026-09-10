use crate::commands::now_iso;
use crate::Db;
use rusqlite::{params, Connection};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// 番茄阶段：专注 / 休息。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Focus,
    Break,
}

/// 番茄状态机（单实例，存于计时线程）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pomodoro {
    pub phase: Phase,
    /// 本阶段剩余秒数
    pub remaining_sec: i64,
    pub focus_min: i64,
    pub break_min: i64,
}

/// 番茄每秒推进的输出：是否切换阶段、是否弹通知、通知文案。
#[derive(Debug, PartialEq)]
pub struct Action {
    pub switch_to: Option<Phase>,
    pub notify: Option<&'static str>,
    /// 专注到点：停止当前计时落库
    pub stop_timer: bool,
}

impl Pomodoro {
    pub fn new(focus_min: i64, break_min: i64) -> Self {
        Pomodoro { phase: Phase::Focus, remaining_sec: focus_min * 60, focus_min, break_min }
    }

    /// 每秒推进（纯函数，TDD）。到点切阶段并产出通知/停计时动作。
    pub fn advance(&mut self) -> Action {
        self.remaining_sec -= 1;
        if self.remaining_sec > 0 {
            return Action { switch_to: None, notify: None, stop_timer: false };
        }
        match self.phase {
            Phase::Focus => {
                self.phase = Phase::Break;
                self.remaining_sec = self.break_min * 60;
                Action {
                    switch_to: Some(Phase::Break),
                    notify: Some("专注结束，休息一下"),
                    stop_timer: true,
                }
            }
            Phase::Break => {
                self.phase = Phase::Focus;
                self.remaining_sec = self.focus_min * 60;
                Action {
                    switch_to: Some(Phase::Focus),
                    notify: Some("休息结束，继续专注"),
                    stop_timer: false,
                }
            }
        }
    }
}

/// 托盘 tooltip 文案（纯函数，TDD）。
pub fn tray_tooltip(running_title: Option<(&str, i64)>, pomodoro: Option<(&Phase, i64)>) -> String {
    if let Some((phase, remaining)) = pomodoro {
        let label = if *phase == Phase::Break { "休息中" } else { "番茄专注" };
        return format!("{label} {} · MyDesk", mmss(remaining));
    }
    match running_title {
        Some((title, elapsed)) => format!("正在专注：{title} ({})", mmss(elapsed)),
        None => "MyDesk 个人工作台".into(),
    }
}

fn mmss(total_sec: i64) -> String {
    format!("{:02}:{:02}", total_sec / 60, total_sec % 60)
}

pub struct TimerState {
    /// 番茄是否开启
    pub active: AtomicBool,
    /// 番茄状态机（仅 active 时有效）
    pub pomodoro: Mutex<Option<Pomodoro>>,
    /// 番茄焦点任务（可为 None：仅跑钟不绑任务）
    pub task_id: Mutex<Option<String>>,
}

pub fn start(app: AppHandle, tray: TrayIcon) {
    std::thread::spawn(move || loop {
        if let Err(e) = tick(&app, &tray) {
            println!("计时心跳失败：{e}");
        }
        std::thread::sleep(Duration::from_secs(1));
    });
}

fn tick(app: &AppHandle, tray: &TrayIcon) -> anyhow::Result<()> {
    let state: tauri::State<TimerState> = app.state();
    let db: tauri::State<Db> = app.state();
    let pomo_active = state.active.load(Ordering::Relaxed);

    // 番茄到点：停计时 + 通知 + 切阶段
    if pomo_active {
        let mut guard = state.pomodoro.lock().unwrap();
        if let Some(pomo) = guard.as_mut() {
            let action = pomo.advance();
            if let Some(msg) = action.notify {
                app.notification().builder().title("番茄钟").body(msg).show()?;
            }
            if action.stop_timer {
                let conn = db.0.lock().map_err(|e| anyhow::anyhow!(e.to_string()))?;
                let _ = stop_running(&conn, &now_iso());
            }
        }
    }

    // 托盘 tooltip：番茄剩余 > 计时信息 > 默认
    let tooltip = if pomo_active {
        let guard = state.pomodoro.lock().unwrap();
        match guard.as_ref() {
            Some(p) => tray_tooltip(None, Some((&p.phase, p.remaining_sec))),
            None => {
                let conn = db.0.lock().map_err(|e| anyhow::anyhow!(e.to_string()))?;
                match running_title(&conn) {
                    Some(title) => tray_tooltip(Some((&title, 0)), None),
                    None => tray_tooltip(None, None),
                }
            }
        }
    } else {
        let conn = db.0.lock().map_err(|e| anyhow::anyhow!(e.to_string()))?;
        match running_title(&conn) {
            Some(title) => {
                let elapsed = elapsed_of(&conn).unwrap_or(0);
                tray_tooltip(Some((&title, elapsed)), None)
            }
            None => tray_tooltip(None, None),
        }
    };
    let _ = tray.set_tooltip(Some(tooltip.as_str()));
    Ok(())
}

fn running_title(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT t.title FROM time_entries e JOIN tasks t ON t.id = e.task_id WHERE e.ended_at IS NULL LIMIT 1",
        [],
        |r| r.get(0),
    )
    .ok()
}

fn elapsed_of(conn: &Connection) -> Option<i64> {
    let started: String = conn
        .query_row(
            "SELECT started_at FROM time_entries WHERE ended_at IS NULL LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok()?;
    crate::reminders::parse_naive(&started)
        .map(|t| (chrono::Local::now().naive_local() - t).num_seconds().max(0))
}

fn stop_running(conn: &Connection, now: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE time_entries SET ended_at=?1 WHERE ended_at IS NULL",
        params![now],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pomodoro_counts_down_then_switches() {
        let mut p = Pomodoro::new(25, 5);
        // 前 25*60-1 秒：专注倒计时
        for _ in 0..25 * 60 - 1 {
            let a = p.advance();
            assert_eq!(a, Action { switch_to: None, notify: None, stop_timer: false });
        }
        assert_eq!(p.phase, Phase::Focus);
        // 第 25 分钟整：切休息 + 通知 + 停计时
        let a = p.advance();
        assert_eq!(a.switch_to, Some(Phase::Break));
        assert_eq!(a.notify, Some("专注结束，休息一下"));
        assert!(a.stop_timer);
        assert_eq!(p.phase, Phase::Break);
        assert_eq!(p.remaining_sec, 5 * 60);
        // 休息 5 分钟到点：切回专注，不停计时
        for _ in 0..5 * 60 - 1 {
            let a = p.advance();
            assert_eq!(a, Action { switch_to: None, notify: None, stop_timer: false });
        }
        let a = p.advance();
        assert_eq!(a.switch_to, Some(Phase::Focus));
        assert_eq!(a.notify, Some("休息结束，继续专注"));
        assert!(!a.stop_timer);
    }

    #[test]
    fn tray_tooltip_states() {
        assert_eq!(tray_tooltip(None, None), "MyDesk 个人工作台");
        assert_eq!(tray_tooltip(Some(("写报告", 125)), None), "正在专注：写报告 (02:05)");
        assert_eq!(
            tray_tooltip(None, Some((&Phase::Focus, 90))),
            "番茄专注 01:30 · MyDesk"
        );
        assert_eq!(
            tray_tooltip(None, Some((&Phase::Break, 61))),
            "休息中 01:01 · MyDesk"
        );
    }
}
