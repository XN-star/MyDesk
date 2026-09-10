use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

pub const TASK_COLS: &str = "id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, repeat, created_at, updated_at";
pub const TASK_INSERT: &str = "INSERT INTO tasks (id, board_id, title, description, status, priority, due_at, sort_order, done_at, remind_minutes_before, repeat, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)";
pub const SETTING_INSERT: &str = "INSERT INTO settings (key, value) VALUES (?1, ?2)";
pub const NOTE_COLS: &str = "id, title, content, pinned, created_at, updated_at";
pub const NOTE_INSERT: &str =
    "INSERT INTO notes (id, title, content, pinned, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)";
pub const LINK_COLS: &str = "id, title, kind, target, sort_order, created_at, updated_at";
pub const LINK_INSERT: &str =
    "INSERT INTO links (id, title, kind, target, sort_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)";
pub const BOARD_COLS: &str = "id, name, created_at, updated_at";
pub const BOARD_INSERT: &str =
    "INSERT INTO boards (id, name, created_at, updated_at) VALUES (?1,?2,?3,?4)";
pub const HABIT_COLS: &str = "id, name, frequency, reminder, archived, created_at, updated_at";
pub const HABIT_INSERT: &str =
    "INSERT INTO habits (id, name, frequency, reminder, archived, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7)";
pub const HABIT_LOG_COLS: &str = "id, habit_id, date, value";
pub const HABIT_LOG_INSERT: &str =
    "INSERT INTO habit_logs (id, habit_id, date, value) VALUES (?1,?2,?3,?4)";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub board_id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: i64,
    pub due_at: Option<String>,
    pub sort_order: f64,
    pub done_at: Option<String>,
    /// 提前提醒分钟数：None=不提醒，0=准点，n=提前 n 分钟。
    pub remind_minutes_before: Option<i64>,
    /// 重复规则：None=一次性；Some("daily"|"weekly"|"monthly")=到期完成时顺延生成下一单。
    pub repeat: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "dft_priority")]
    pub priority: i64,
    #[serde(default)]
    pub due_at: Option<String>,
    #[serde(default = "dft_status")]
    pub status: String,
    #[serde(default = "dft_remind")]
    pub remind_minutes_before: Option<i64>,
    #[serde(default)]
    pub board_id: Option<String>,
    #[serde(default)]
    pub repeat: Option<String>,
}

fn dft_priority() -> i64 {
    1
}
fn dft_status() -> String {
    "todo".into()
}
fn dft_remind() -> Option<i64> {
    Some(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingRow {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub title: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub target: String,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInput {
    pub title: String,
    #[serde(default = "dft_kind")]
    pub kind: String,
    pub target: String,
}

fn dft_kind() -> String {
    "url".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardInput {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: String,
    pub name: String,
    /// daily | weekly | monthly
    pub frequency: String,
    /// 每日提醒时刻 'HH:MM'；None=不提醒。
    pub reminder: Option<String>,
    pub archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitInput {
    pub name: String,
    #[serde(default = "dft_frequency")]
    pub frequency: String,
    #[serde(default)]
    pub reminder: Option<String>,
}

fn dft_frequency() -> String {
    "daily".into()
}

/// 打卡日志：value 1=完成 0=未完成 2=跳过（分数冻结）。UNIQUE(habit_id, date)。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitLog {
    pub id: String,
    pub habit_id: String,
    pub date: String,
    pub value: i64,
}

pub fn task_from_row(r: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        board_id: r.get(1)?,
        title: r.get(2)?,
        description: r.get(3)?,
        status: r.get(4)?,
        priority: r.get(5)?,
        due_at: r.get(6)?,
        sort_order: r.get(7)?,
        done_at: r.get(8)?,
        remind_minutes_before: r.get(9)?,
        repeat: r.get(10)?,
        created_at: r.get(11)?,
        updated_at: r.get(12)?,
    })
}

pub fn query_all_tasks(c: &Connection) -> rusqlite::Result<Vec<Task>> {
    let mut stmt = c.prepare(&format!("SELECT {TASK_COLS} FROM tasks ORDER BY sort_order"))?;
    let rows = stmt.query_map([], task_from_row)?;
    rows.collect()
}

pub fn query_all_settings(c: &Connection) -> rusqlite::Result<Vec<SettingRow>> {
    let mut stmt = c.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| {
        Ok(SettingRow {
            key: r.get(0)?,
            value: r.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn note_from_row(r: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        title: r.get(1)?,
        content: r.get(2)?,
        pinned: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

pub fn query_all_notes(c: &Connection) -> rusqlite::Result<Vec<Note>> {
    let mut stmt =
        c.prepare(&format!("SELECT {NOTE_COLS} FROM notes ORDER BY pinned DESC, updated_at DESC"))?;
    let rows = stmt.query_map([], note_from_row)?;
    rows.collect()
}

pub fn link_from_row(r: &Row) -> rusqlite::Result<Link> {
    Ok(Link {
        id: r.get(0)?,
        title: r.get(1)?,
        kind: r.get(2)?,
        target: r.get(3)?,
        sort_order: r.get(4)?,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

pub fn query_all_links(c: &Connection) -> rusqlite::Result<Vec<Link>> {
    let mut stmt = c.prepare(&format!("SELECT {LINK_COLS} FROM links ORDER BY sort_order"))?;
    let rows = stmt.query_map([], link_from_row)?;
    rows.collect()
}

pub fn board_from_row(r: &Row) -> rusqlite::Result<Board> {
    Ok(Board {
        id: r.get(0)?,
        name: r.get(1)?,
        created_at: r.get(2)?,
        updated_at: r.get(3)?,
    })
}

pub fn query_all_boards(c: &Connection) -> rusqlite::Result<Vec<Board>> {
    let mut stmt = c.prepare(&format!("SELECT {BOARD_COLS} FROM boards ORDER BY created_at"))?;
    let rows = stmt.query_map([], board_from_row)?;
    rows.collect()
}

pub fn query_one_board(c: &Connection, id: &str) -> rusqlite::Result<Board> {
    c.query_row(
        &format!("SELECT {BOARD_COLS} FROM boards WHERE id=?1"),
        params![id],
        board_from_row,
    )
}

pub fn habit_from_row(r: &Row) -> rusqlite::Result<Habit> {
    Ok(Habit {
        id: r.get(0)?,
        name: r.get(1)?,
        frequency: r.get(2)?,
        reminder: r.get(3)?,
        archived: r.get::<_, i64>(4)? != 0,
        created_at: r.get(5)?,
        updated_at: r.get(6)?,
    })
}

pub fn query_all_habits(c: &Connection) -> rusqlite::Result<Vec<Habit>> {
    let mut stmt =
        c.prepare(&format!("SELECT {HABIT_COLS} FROM habits WHERE archived=0 ORDER BY created_at"))?;
    let rows = stmt.query_map([], habit_from_row)?;
    rows.collect()
}

pub fn habit_log_from_row(r: &Row) -> rusqlite::Result<HabitLog> {
    Ok(HabitLog {
        id: r.get(0)?,
        habit_id: r.get(1)?,
        date: r.get(2)?,
        value: r.get(3)?,
    })
}

/// 区间日志（含边界），按习惯与日期排序。
pub fn query_logs_between(c: &Connection, from: &str, to: &str) -> rusqlite::Result<Vec<HabitLog>> {
    let mut stmt = c.prepare(&format!(
        "SELECT {HABIT_LOG_COLS} FROM habit_logs WHERE date >= ?1 AND date <= ?2 ORDER BY habit_id, date"
    ))?;
    let rows = stmt.query_map(params![from, to], habit_log_from_row)?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        crate::db::migrate(&c).unwrap();
        c
    }

    #[test]
    fn task_roundtrip_via_row_mapping() {
        let c = mem();
        c.execute(TASK_INSERT, params!["t1", "default", "写报告", "周报", "todo", 2, "2026-09-08T10:00:00", 100.0, None::<String>, Some(15), None::<String>, "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let got = query_all_tasks(&c).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].title, "写报告");
        assert_eq!(got[0].due_at.as_deref(), Some("2026-09-08T10:00:00"));
        assert_eq!(got[0].priority, 2);
        assert_eq!(got[0].board_id, "default");
        assert_eq!(got[0].remind_minutes_before, Some(15));
        assert_eq!(got[0].repeat, None);
    }

    #[test]
    fn task_repeat_roundtrip() {
        let c = mem();
        c.execute(TASK_INSERT, params!["t1", "default", "喝水", "", "todo", 1, "2026-09-08T10:00:00", 100.0, None::<String>, Some(0), Some("daily"), "2026-09-07T09:00:00", "2026-09-07T09:00:00"]).unwrap();
        let got = query_all_tasks(&c).unwrap();
        assert_eq!(got[0].repeat.as_deref(), Some("daily"));
    }

    #[test]
    fn task_input_repeat_default_none() {
        let json = r#"{"title":"一次性"}"#;
        let input: TaskInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.repeat, None);
        let json2 = r#"{"title":"每天","repeat":"weekly"}"#;
        let input2: TaskInput = serde_json::from_str(json2).unwrap();
        assert_eq!(input2.repeat.as_deref(), Some("weekly"));
    }

    #[test]
    fn habit_roundtrip_and_order() {
        let c = mem();
        c.execute(HABIT_INSERT, params!["h1", "健身", "weekly", Some("08:00"), 0, "2026-09-09T10:00:00", "2026-09-09T10:00:00"]).unwrap();
        c.execute(HABIT_INSERT, params!["h2", "喝水", "daily", None::<String>, 0, "2026-09-09T09:00:00", "2026-09-09T09:00:00"]).unwrap();
        let got = query_all_habits(&c).unwrap();
        let ids: Vec<&str> = got.iter().map(|h| h.id.as_str()).collect();
        assert_eq!(ids, vec!["h2", "h1"], "按 created_at 升序");
        assert_eq!(got[0].frequency, "daily");
        assert_eq!(got[0].reminder, None);
        assert!(!got[0].archived);
        assert_eq!(got[1].reminder.as_deref(), Some("08:00"));
    }

    #[test]
    fn habit_input_defaults() {
        let json = r#"{"name":"晨读"}"#;
        let input: HabitInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.frequency, "daily");
        assert_eq!(input.reminder, None);
    }

    #[test]
    fn habit_log_roundtrip_and_range_query() {
        let c = mem();
        c.execute(HABIT_LOG_INSERT, params!["l1", "h1", "2026-09-01", 1]).unwrap();
        c.execute(HABIT_LOG_INSERT, params!["l2", "h1", "2026-09-05", 1]).unwrap();
        c.execute(HABIT_LOG_INSERT, params!["l3", "h2", "2026-09-02", 1]).unwrap();
        let got = query_logs_between(&c, "2026-09-01", "2026-09-04").unwrap();
        let ids: Vec<&str> = got.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, vec!["l1", "l3"], "区间内按 habit_id, date 排序");
    }

    #[test]
    fn task_input_defaults() {
        let json = r#"{"title":"买牛奶"}"#;
        let input: TaskInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.priority, 1);
        assert_eq!(input.status, "todo");
        assert_eq!(input.due_at, None);
        assert_eq!(input.remind_minutes_before, Some(0), "默认准点提醒");
    }

    #[test]
    fn task_input_remind_null() {
        let json = r#"{"title":"静默任务","remindMinutesBefore":null}"#;
        let input: TaskInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.remind_minutes_before, None);
    }

    #[test]
    fn note_roundtrip_via_row_mapping() {
        let c = mem();
        c.execute(
            NOTE_INSERT,
            params!["n1", "会议记录", "第一行内容", 1, "2026-09-08T10:00:00", "2026-09-08T10:00:00"],
        )
        .unwrap();
        let got = query_all_notes(&c).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "n1");
        assert_eq!(got[0].title, "会议记录");
        assert_eq!(got[0].content, "第一行内容");
        assert!(got[0].pinned);
        assert_eq!(got[0].created_at, "2026-09-08T10:00:00");
    }

    #[test]
    fn notes_order_pinned_then_updated_desc() {
        let c = mem();
        c.execute(NOTE_INSERT, params!["a", "旧未置顶", "", 0, "2026-09-08T09:00:00", "2026-09-08T09:00:00"]).unwrap();
        c.execute(NOTE_INSERT, params!["b", "新未置顶", "", 0, "2026-09-08T11:00:00", "2026-09-08T11:00:00"]).unwrap();
        c.execute(NOTE_INSERT, params!["p", "置顶", "", 1, "2026-09-08T08:00:00", "2026-09-08T08:00:00"]).unwrap();
        let got = query_all_notes(&c).unwrap();
        let ids: Vec<&str> = got.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, vec!["p", "b", "a"]);
    }

    #[test]
    fn note_input_defaults() {
        let json = r#"{"title":"随手记"}"#;
        let input: NoteInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.title, "随手记");
        assert_eq!(input.content, "");
    }

    #[test]
    fn link_roundtrip_via_row_mapping() {
        let c = mem();
        c.execute(
            LINK_INSERT,
            params!["l1", "Gmail", "url", "https://mail.google.com", 100.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"],
        )
        .unwrap();
        let got = query_all_links(&c).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].id, "l1");
        assert_eq!(got[0].title, "Gmail");
        assert_eq!(got[0].kind, "url");
        assert_eq!(got[0].target, "https://mail.google.com");
        assert_eq!(got[0].sort_order, 100.0);
    }

    #[test]
    fn links_order_by_sort_order() {
        let c = mem();
        c.execute(LINK_INSERT, params!["b", "第二", "url", "https://b.example.com", 200.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"]).unwrap();
        c.execute(LINK_INSERT, params!["a", "第一", "path", "C:\\dir", 100.0, "2026-09-08T10:00:00", "2026-09-08T10:00:00"]).unwrap();
        let got = query_all_links(&c).unwrap();
        let ids: Vec<&str> = got.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, vec!["a", "b"]);
    }

    #[test]
    fn link_input_defaults() {
        let json = r#"{"title":"文档","target":"C:\\doc"}"#;
        let input: LinkInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.kind, "url");
        assert_eq!(input.target, "C:\\doc");
    }

    #[test]
    fn board_roundtrip_and_order() {
        let c = mem();
        c.execute(BOARD_INSERT, params!["b2", "工作", "2026-09-09T10:00:00", "2026-09-09T10:00:00"]).unwrap();
        let got = query_all_boards(&c).unwrap();
        // mem() 迁移时已种子 default（created_at 更早），排序在首位
        let ids: Vec<&str> = got.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, vec!["default", "b2"]);
        assert_eq!(got[0].name, "默认看板");
        let one = query_one_board(&c, "b2").unwrap();
        assert_eq!(one.name, "工作");
    }

    #[test]
    fn task_input_board_default() {
        let json = r#"{"title":"买牛奶"}"#;
        let input: TaskInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.board_id, None);
        let json2 = r#"{"title":"工作","boardId":"b2"}"#;
        let input2: TaskInput = serde_json::from_str(json2).unwrap();
        assert_eq!(input2.board_id.as_deref(), Some("b2"));
    }
}
