# v1.3 阅读清单 + 知识卡 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 MyDesk v1.2 基础上新增「📚 阅读清单」「🧠 知识卡」两个模块,完成"读→记→摘→复习"闭环,数据库迁移 v11,备份格式 v11。

**Architecture:** 沿用项目既有四件套 — Rust 后端 (rusqlite + tauri::command) + React 19 + Zustand store + 纯函数 TDD。前端两个模块各起一个 feature 目录,共享 `src/lib/format.ts` 等已有工具。新增三张表 `reading_items` / `flashcard_cards` / `flashcard_reviews`,FTS5 同步 `reading_items` 标题/作者/源 URL;闪卡不复制文本(只存位置),源来自 notes。备份 v11 一次升版,兼容 v10 旧库。

**Tech Stack:** Tauri 2 · React 19 · TypeScript · Zustand · dnd-kit (现状) · date-fns (现状) · rusqlite · SQLite FTS5 · Vitest

## Global Constraints

- **定位不变:** 本地、单机、100% 数据本地;无账号、无云同步、无 AI。
- **TDD 友好:** 所有非平凡纯函数必须先写 vitest 测试再实现;`src/features/<name>/<name>.test.ts` 与 `src-tauri/src/*.rs` 测试同步。
- **模块注册:** 新模块 = `src/features/<id>/` + `src/modules/meta.ts` 追加 + `src/modules/registry.ts` 追加 (一行 ROUTES + 一行 COMPONENTS)。
- **数据库迁移:** 新表 / 新列必须走 `src-tauri/src/db.rs` 中 `upgrade_to_vN` 幂等函数,新版本号加在 `migrate()` 末尾链上。
- **备份兼容:** 新表对旧版备份视为空 (整库替换语义);`backup.rs` 的 `VERSION` 加一并扩 export/import。
- **i18n/字面量:** 文案统一中文,emoji 与现有模块保持一致风格 (青/蓝/紫/琥珀/红/绿/金/粉/天蓝 侧边色 + Unicode icon)。
- **commit 风格:** `feat:` / `fix:` / `chore:` / `docs:` / `refactor:` 前缀;`npm run test` 与 `cargo test` 双绿才提交。
- **不要重写已有模块:** 速记、任务、习惯、记账的实现不动;只读其接口。
- **CSS 沿用 token:** 主题色 / 圆角 / 阴影 / 动效从 `index.css` 取,不写硬编码。

---

## 阶段 1:数据库迁移 v11 + 共享基础设施

### Task 1: 添加 v11 SQL 迁移常量

**Files:**
- Modify: `src-tauri/src/db.rs:265-294` (在 `MIGRATE_V10` 之后追加 `MIGRATE_V11`)
- Modify: `src-tauri/src/db.rs:144-263` (在 `SCHEMA_V9` 之后追加 `SCHEMA_V10`,把 v10 升级到 v11 形态)

**Interfaces:**
- Consumes: 无
- Produces: 公开常量 `pub const MIGRATE_V11: &str` 和 `pub const SCHEMA_V10: &str` (后者用于全新库直接创建 v10 形态,本任务不立即使用但需要给 v12 留接口)

- [ ] **Step 1: 在 `db.rs` 顶部 `MIGRATE_V10` 常量后追加 `MIGRATE_V11`**

紧接 `pub const MIGRATE_V10: &str = "...` 块结束的大括号后追加:

```rust
/// v10→v11：新增 reading_items / flashcard_cards / flashcard_reviews 三表。
/// FTS5 触发器在 upgrade_to_v11() 末尾追加（reading_items 索引）。
pub const MIGRATE_V11: &str = "
CREATE TABLE IF NOT EXISTS reading_items (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK(kind IN ('book','movie','tv','podcast','article','other')),
  title         TEXT NOT NULL,
  creator       TEXT,
  source_url    TEXT,
  status        TEXT NOT NULL CHECK(status IN ('wishlist','in_progress','done','paused','dropped')),
  rating        INTEGER CHECK(rating BETWEEN 0 AND 5),
  progress_total INTEGER,
  progress_current INTEGER,
  cover_path    TEXT,
  started_at    TEXT,
  finished_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  notes_id      TEXT REFERENCES notes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reading_status ON reading_items(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_kind   ON reading_items(kind, status);
CREATE INDEX IF NOT EXISTS idx_reading_notes  ON reading_items(notes_id);
CREATE TABLE IF NOT EXISTS flashcard_cards (
  id            TEXT PRIMARY KEY,
  note_id       TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  seg_offset    INTEGER NOT NULL,
  seg_length    INTEGER NOT NULL,
  seg_hash      TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flashcard_note ON flashcard_cards(note_id);
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  card_id       TEXT PRIMARY KEY REFERENCES flashcard_cards(id) ON DELETE CASCADE,
  next_due      TEXT NOT NULL,
  interval_days REAL NOT NULL DEFAULT 1,
  factor        REAL NOT NULL DEFAULT 2.0,
  reps          INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_flashcard_due ON flashcard_reviews(next_due);
";

/// v11 FTS 触发器：reading_items 增删改 → search_index。
/// 与 SEARCH_TRIGGERS 同样使用 IF NOT EXISTS，幂等。
pub const READING_FTS_TRIGGERS: &str = "
CREATE TRIGGER IF NOT EXISTS reading_ai AFTER INSERT ON reading_items BEGIN
  INSERT INTO search_index(kind, ref_id, title, body)
  VALUES('reading', new.id, cjk_space(new.title), COALESCE(cjk_space(new.creator),'') || ' ' || COALESCE(cjk_space(new.source_url),''));
END;
CREATE TRIGGER IF NOT EXISTS reading_ad AFTER DELETE ON reading_items BEGIN
  DELETE FROM search_index WHERE kind='reading' AND ref_id=old.id;
END;
CREATE TRIGGER IF NOT EXISTS reading_au AFTER UPDATE ON reading_items BEGIN
  DELETE FROM search_index WHERE kind='reading' AND ref_id=old.id;
  INSERT INTO search_index(kind, ref_id, title, body)
  VALUES('reading', new.id, cjk_space(new.title), COALESCE(cjk_space(new.creator),'') || ' ' || COALESCE(cjk_space(new.source_url),''));
END;
";
```

- [ ] **Step 2: 验证 `cargo build` 通过**

Run: `cd src-tauri && cargo build`
Expected: `Finished` 无 error。新增常量未引用,不会有警告(warning)除非字符串里有重复键之类。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): v11 SQL 迁移与 reading_items FTS 触发器常量"
```

### Task 2: 添加 `upgrade_to_v11` 并接入 migrate 链

**Files:**
- Modify: `src-tauri/src/db.rs:735-748` (在 `upgrade_to_v10` 之后追加 `upgrade_to_v11` 函数)
- Modify: `src-tauri/src/db.rs:679-689` (`migrate()` 中 v10 升级行后加 `upgrade_to_v11` 调用 + `user_version = 11`)
- Modify: `src-tauri/src/db.rs:660-668` (全新库分支同步升到 v11)

**Interfaces:**
- Consumes: `pub const MIGRATE_V11: &str`、`pub const READING_FTS_TRIGGERS: &str` (Task 1 产出)
- Produces: 公开函数 `fn upgrade_to_v11(conn: &Connection) -> rusqlite::Result<()>`

- [ ] **Step 1: 在 `db.rs` 末尾现有 `upgrade_to_v10` 之后追加**

```rust
fn upgrade_to_v11(conn: &Connection) -> rusqlite::Result<()> {
    if !table_exists(conn, "reading_items")? {
        conn.execute_batch(MIGRATE_V11)?;
        // reading_items 一次性回填 search_index（建触发器前的存量）。
        conn.execute_batch(
            "INSERT INTO search_index(kind, ref_id, title, body)
             SELECT 'reading', id, cjk_space(title),
                    COALESCE(cjk_space(creator),'') || ' ' || COALESCE(cjk_space(source_url),'')
             FROM reading_items;"
        )?;
        conn.execute_batch(READING_FTS_TRIGGERS)?;
    }
    Ok(())
}
```

- [ ] **Step 2: 修改 `migrate()` 函数,在 v10 链后追加 v11**

将 `db.rs` 中 `migrate()` 末尾:
```rust
    upgrade_to_v10(conn)?;
    conn.pragma_update(None, "user_version", 10)?;
    Ok(())
```
替换为:
```rust
    upgrade_to_v10(conn)?;
    upgrade_to_v11(conn)?;
    conn.pragma_update(None, "user_version", 11)?;
    Ok(())
```

- [ ] **Step 3: 全新库分支同步升到 v11**

将 `db.rs` 中 `migrate()` 函数 "全新库" 分支:
```rust
            conn.execute_batch(SCHEMA_V9)?;
            seed_default_board(conn)?;
            conn.execute_batch(MIGRATE_V10)?;
            conn.pragma_update(None, "user_version", 10)?;
            return Ok(());
```
替换为:
```rust
            conn.execute_batch(SCHEMA_V9)?;
            seed_default_board(conn)?;
            conn.execute_batch(MIGRATE_V10)?;
            upgrade_to_v11(conn)?;
            conn.pragma_update(None, "user_version", 11)?;
            return Ok(());
```

- [ ] **Step 4: 写一个 v10→v11 迁移测试**

在 `db.rs` 末尾测试模块(`#[cfg(test)] mod tests`)中添加:

```rust
    #[test]
    fn v10_db_migrates_to_v11_with_three_tables() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("PRAGMA user_version = 10;").unwrap();
        // 构造最小 v10 库（仅 notes 表 + search_index 必须存在）。
        c.execute_batch(
            "CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT, content TEXT, pinned INTEGER, created_at TEXT, updated_at TEXT);
             CREATE VIRTUAL TABLE search_index USING fts5(kind, ref_id, title, body, tokenize='unicode61 remove_diacritics 2');
             INSERT INTO notes VALUES('n1','t','c',0,'2026-01-01','2026-01-01');"
        ).unwrap();
        crate::db::migrate(&c).unwrap();
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 11);
        let has_reading: i64 = c.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='reading_items'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(has_reading, 1);
        let has_cards: i64 = c.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='flashcard_cards'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(has_cards, 1);
        let has_reviews: i64 = c.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='flashcard_reviews'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(has_reviews, 1);
    }

    #[test]
    fn reading_fts_trigger_inserts_into_search_index() {
        let c = Connection::open_in_memory().unwrap();
        crate::db::register_cjk_space(&c).unwrap();
        c.execute_batch(crate::db::SCHEMA_V9).unwrap();
        c.execute_batch(crate::db::SEARCH_TRIGGERS).unwrap();
        c.execute_batch(crate::db::MIGRATE_V10).unwrap();
        crate::db::migrate(&c).unwrap();
        c.execute(
            "INSERT INTO reading_items (id, kind, title, creator, status, created_at, updated_at)
             VALUES ('r1','book','预算管理','张三','wishlist','2026-09-11','2026-09-11')",
            [],
        ).unwrap();
        let n: i64 = c.query_row(
            "SELECT COUNT(*) FROM search_index WHERE kind='reading' AND ref_id='r1'",
            [], |r| r.get(0)
        ).unwrap();
        assert_eq!(n, 1);
    }
```

- [ ] **Step 5: 运行测试**

Run: `cd src-tauri && cargo test v10_db_migrates_to_v11`
Expected: `2 passed`

- [ ] **Step 6: 运行所有后端测试**

Run: `cd src-tauri && cargo test`
Expected: 全部通过（含之前的迁移测试，无回归）。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db.rs
git commit -m "feat(db): 接入 v10→v11 迁移链与 reading FTS 触发测试"
```

### Task 3: 添加 ReadingItem / FlashcardCard / FlashcardReview Rust 模型

**Files:**
- Modify: `src-tauri/src/models.rs:30-32` (在 WORKOUT_LOG_INSERT 后追加三组 COLS+INSERT)
- Modify: `src-tauri/src/models.rs` (在 `WorkoutLog` 结构体之后追加三个 struct,见 Step 1)

**Interfaces:**
- Consumes: 数据库表 schema (Task 1)
- Produces: 三个 serde 模型 `ReadingItem`、`ReadingItemInput`、`FlashcardCard`、`FlashcardReview`

- [ ] **Step 1: 在 `models.rs` 末尾追加常量与结构体**

紧接 `pub const WORKOUT_LOG_INSERT: &str = "..."` 行后追加:

```rust
pub const READING_COLS: &str = "id, kind, title, creator, source_url, status, rating, progress_total, progress_current, cover_path, started_at, finished_at, created_at, updated_at, notes_id";
pub const READING_INSERT: &str = "INSERT INTO reading_items (id, kind, title, creator, source_url, status, rating, progress_total, progress_current, cover_path, started_at, finished_at, created_at, updated_at, notes_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)";
pub const FLASHCARD_CARD_COLS: &str = "id, note_id, seg_offset, seg_length, seg_hash, created_at";
pub const FLASHCARD_CARD_INSERT: &str = "INSERT INTO flashcard_cards (id, note_id, seg_offset, seg_length, seg_hash, created_at) VALUES (?1,?2,?3,?4,?5,?6)";
pub const FLASHCARD_REVIEW_COLS: &str = "card_id, next_due, interval_days, factor, reps, lapses";
pub const FLASHCARD_REVIEW_UPSERT: &str = "INSERT INTO flashcard_reviews (card_id, next_due, interval_days, factor, reps, lapses) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(card_id) DO UPDATE SET next_due=excluded.next_due, interval_days=excluded.interval_days, factor=excluded.factor, reps=excluded.reps, lapses=excluded.lapses";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingItem {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub creator: Option<String>,
    pub source_url: Option<String>,
    pub status: String,
    pub rating: Option<i64>,
    pub progress_total: Option<i64>,
    pub progress_current: Option<i64>,
    pub cover_path: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub notes_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingItemInput {
    pub kind: String,
    pub title: String,
    #[serde(default)]
    pub creator: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default = "dft_reading_status")]
    pub status: String,
    #[serde(default)]
    pub rating: Option<i64>,
    #[serde(default)]
    pub progress_total: Option<i64>,
    #[serde(default)]
    pub progress_current: Option<i64>,
    #[serde(default)]
    pub cover_path: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub notes_id: Option<String>,
}

fn dft_reading_status() -> String { "wishlist".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardCard {
    pub id: String,
    pub note_id: String,
    pub seg_offset: i64,
    pub seg_length: i64,
    pub seg_hash: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardReview {
    pub card_id: String,
    pub next_due: String,
    pub interval_days: f64,
    pub factor: f64,
    pub reps: i64,
    pub lapses: i64,
}
```

- [ ] **Step 2: cargo build**

Run: `cd src-tauri && cargo build`
Expected: 编译通过,无 warning（未引用常量可能 unused warning,在 models.rs 顶用 `#[allow(dead_code)]` 加在常量上,或等到 Task 4 引用时再消）。若出现 `unused` 警告,加在三个 const 块前一行 `#[allow(dead_code)]`。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/models.rs
git commit -m "feat(models): ReadingItem / FlashcardCard / FlashcardReview 结构体"
```

### Task 4: 添加 reading/flashcard Tauri 命令的 DB 助手函数

**Files:**
- Modify: `src-tauri/src/db.rs` (在文件末尾、测试模块之前追加 5 个 query_* 助手函数)

**Interfaces:**
- Consumes: `ReadingItem` / `ReadingItemInput` / `FlashcardCard` / `FlashcardReview` (Task 3)
- Produces: 5 个内部 helper:`query_all_reading(conn)` / `query_reading(conn, id)` / `query_all_flashcards_by_note(conn, note_id)` / `query_flashcards_due(conn, today)` / `query_flashcard_review(conn, card_id)`

- [ ] **Step 1: 在 `db.rs` 末尾、测试模块前追加 helper**

在 `fn column_exists(...)` 块之后、`#[cfg(test)] mod tests {` 之前追加:

```rust
pub fn query_all_reading(conn: &Connection) -> rusqlite::Result<Vec<crate::models::ReadingItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM reading_items ORDER BY updated_at DESC",
        crate::models::READING_COLS
    ))?;
    let rows = stmt.query_map([], crate::models::row_to_reading)?;
    rows.collect()
}

pub fn query_reading(conn: &Connection, id: &str) -> rusqlite::Result<Option<crate::models::ReadingItem>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM reading_items WHERE id = ?1",
        crate::models::READING_COLS
    ))?;
    let mut rows = stmt.query([id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(crate::models::row_to_reading(row)?))
    } else {
        Ok(None)
    }
}

pub fn query_all_flashcards_by_note(conn: &Connection, note_id: &str) -> rusqlite::Result<Vec<crate::models::FlashcardCard>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM flashcard_cards WHERE note_id = ?1 ORDER BY seg_offset",
        crate::models::FLASHCARD_CARD_COLS
    ))?;
    let rows = stmt.query_map([note_id], crate::models::row_to_flashcard)?;
    rows.collect()
}

pub fn query_flashcards_due(conn: &Connection, today: &str) -> rusqlite::Result<Vec<(crate::models::FlashcardCard, String, String)>> {
    // 返回 (card, note_title, seg_text) 三元组，前端拿来直接显示。
    let mut stmt = conn.prepare(
        "SELECT fc.id, fc.note_id, fc.seg_offset, fc.seg_length, fc.seg_hash, fc.created_at,
                n.title, substr(n.content, fc.seg_offset + 1, fc.seg_length)
         FROM flashcard_cards fc
         JOIN flashcard_reviews fr ON fr.card_id = fc.id
         JOIN notes n ON n.id = fc.note_id
         WHERE fr.next_due <= ?1
         ORDER BY fr.next_due ASC
         LIMIT 200",
    )?;
    let rows = stmt.query_map([today], |row| {
        let card = crate::models::FlashcardCard {
            id: row.get(0)?,
            note_id: row.get(1)?,
            seg_offset: row.get(2)?,
            seg_length: row.get(3)?,
            seg_hash: row.get(4)?,
            created_at: row.get(5)?,
        };
        Ok((card, row.get::<_, String>(6)?, row.get::<_, String>(7)?))
    })?;
    rows.collect()
}

pub fn query_flashcard_review(conn: &Connection, card_id: &str) -> rusqlite::Result<Option<crate::models::FlashcardReview>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM flashcard_reviews WHERE card_id = ?1",
        crate::models::FLASHCARD_REVIEW_COLS
    ))?;
    let mut rows = stmt.query([card_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(crate::models::row_to_flashcard_review(row)?))
    } else {
        Ok(None)
    }
}
```

- [ ] **Step 2: 在 `models.rs` 末尾追加 3 个 row_to_* helper**

在 Task 3 的结构体定义之后追加:

```rust
pub fn row_to_reading(row: &Row) -> rusqlite::Result<ReadingItem> {
    Ok(ReadingItem {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        creator: row.get(3)?,
        source_url: row.get(4)?,
        status: row.get(5)?,
        rating: row.get(6)?,
        progress_total: row.get(7)?,
        progress_current: row.get(8)?,
        cover_path: row.get(9)?,
        started_at: row.get(10)?,
        finished_at: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        notes_id: row.get(14)?,
    })
}

pub fn row_to_flashcard(row: &Row) -> rusqlite::Result<FlashcardCard> {
    Ok(FlashcardCard {
        id: row.get(0)?,
        note_id: row.get(1)?,
        seg_offset: row.get(2)?,
        seg_length: row.get(3)?,
        seg_hash: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub fn row_to_flashcard_review(row: &Row) -> rusqlite::Result<FlashcardReview> {
    Ok(FlashcardReview {
        card_id: row.get(0)?,
        next_due: row.get(1)?,
        interval_days: row.get(2)?,
        factor: row.get(3)?,
        reps: row.get(4)?,
        lapses: row.get(5)?,
    })
}
```

- [ ] **Step 3: 编译**

Run: `cd src-tauri && cargo build`
Expected: 编译通过。新 helper 尚未被 commands 引用,会有 dead_code 警告；等到 Task 5/8 接入时自动消失,不必现在加 `#[allow(dead_code)]`。

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/db.rs src-tauri/src/models.rs
git commit -m "feat(db): reading/flashcard 查询助手函数"
```

---

## 阶段 2:Tauri 命令层

### Task 5: reading_* Tauri 命令

**Files:**
- Modify: `src-tauri/src/commands.rs:392+` (在末尾、最后一个命令后追加)
- Modify: `src-tauri/src/lib.rs:160-209` (在 `invoke_handler!` 列表末尾追加新命令名)

**Interfaces:**
- Consumes: `ReadingItem` / `ReadingItemInput` (Task 3),`db::query_all_reading` / `db::query_reading` (Task 4)
- Produces: 8 个 `#[tauri::command]`: `reading_list`、`reading_get`、`reading_create`、`reading_update`、`reading_delete`、`reading_import_json`、`reading_import_csv`、`reading_open_notes`

- [ ] **Step 1: 在 `commands.rs` 末尾追加 reading 命令**

在 `commands.rs` 最末尾(最后一个 `#[tauri::command]` 函数后)追加:

```rust
fn gen_id() -> String {
    // 与 TaskInput/NoteInput 一致的 uuid-v4 风格：直接调用 uuid crate（已在 Cargo.toml）。
    use uuid::Uuid;
    Uuid::new_v4().to_string()
}

#[tauri::command]
pub fn reading_list(db: DbState) -> Result<Vec<ReadingItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::query_all_reading(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reading_get(db: DbState, id: String) -> Result<ReadingItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::query_reading(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("reading item {id} not found"))
}

#[tauri::command]
pub fn reading_create(db: DbState, input: ReadingItemInput) -> Result<ReadingItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    let item = ReadingItem {
        id: gen_id(),
        kind: input.kind,
        title: input.title,
        creator: input.creator,
        source_url: input.source_url,
        status: input.status,
        rating: input.rating,
        progress_total: input.progress_total,
        progress_current: input.progress_current,
        cover_path: input.cover_path,
        started_at: input.started_at,
        finished_at: input.finished_at,
        created_at: now.clone(),
        updated_at: now,
        notes_id: input.notes_id,
    };
    conn.execute(
        crate::models::READING_INSERT,
        params![
            item.id, item.kind, item.title, item.creator, item.source_url,
            item.status, item.rating, item.progress_total, item.progress_current,
            item.cover_path, item.started_at, item.finished_at,
            item.created_at, item.updated_at, item.notes_id,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(item)
}

#[tauri::command]
pub fn reading_update(db: DbState, id: String, patch: ReadingItemInput) -> Result<ReadingItem, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE reading_items SET
            kind=?2, title=?3, creator=?4, source_url=?5, status=?6,
            rating=?7, progress_total=?8, progress_current=?9,
            cover_path=?10, started_at=?11, finished_at=?12, notes_id=?13,
            updated_at=?14
         WHERE id=?1",
        params![
            id, patch.kind, patch.title, patch.creator, patch.source_url, patch.status,
            patch.rating, patch.progress_total, patch.progress_current,
            patch.cover_path, patch.started_at, patch.finished_at, patch.notes_id,
            now,
        ],
    ).map_err(|e| e.to_string())?;
    db::query_reading(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("reading item {id} not found"))
}

#[tauri::command]
pub fn reading_delete(db: DbState, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM reading_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reading_import_json(db: DbState, rows: Vec<ReadingItemInput>) -> Result<usize, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let now = now_iso();
    let mut count = 0usize;
    for r in rows {
        let id = gen_id();
        tx.execute(
            crate::models::READING_INSERT,
            params![
                id, r.kind, r.title, r.creator, r.source_url, r.status,
                r.rating, r.progress_total, r.progress_current,
                r.cover_path, r.started_at, r.finished_at,
                now, now, r.notes_id,
            ],
        ).map_err(|e| e.to_string())?;
        count += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn reading_import_csv(db: DbState, text: String) -> Result<usize, String> {
    // CSV 解析放前端 reading 模块的纯函数（Task 12），这里只收 Vec<ReadingItemInput>。
    // 之所以后端再包一层：保持后端对导入格式无依赖，方便以后改格式。
    let _ = (db, text);
    Err("reading_import_csv 应由前端解析后调用 reading_import_json".into())
}

#[tauri::command]
pub fn reading_open_notes(db: DbState, id: String) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let item = db::query_reading(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("reading item {id} not found"))?;
    if let Some(nid) = item.notes_id {
        return Ok(nid);
    }
    // 同名检查：title = "《书名》"。
    let target_title = format!("《{}》", item.title);
    let mut stmt = conn.prepare("SELECT id FROM notes WHERE title = ?1 LIMIT 1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![target_title]).map_err(|e| e.to_string())?;
    let note_id = if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        row.get::<_, String>(0).map_err(|e| e.to_string())?
    } else {
        // 不存在则创建空速记。
        let new_id = gen_id();
        let now = now_iso();
        conn.execute(
            "INSERT INTO notes (id, title, content, pinned, created_at, updated_at) VALUES (?1, ?2, '', 0, ?3, ?3)",
            params![new_id, target_title, now],
        ).map_err(|e| e.to_string())?;
        new_id
    };
    conn.execute(
        "UPDATE reading_items SET notes_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![note_id, now_iso(), id],
    ).map_err(|e| e.to_string())?;
    Ok(note_id)
}
```

- [ ] **Step 2: 在 `lib.rs` 的 `invoke_handler!` 列表末尾追加 8 个命令名**

在 `commands::backup_export,` 这一行后追加:

```rust
            commands::reading_list,
            commands::reading_get,
            commands::reading_create,
            commands::reading_update,
            commands::reading_delete,
            commands::reading_import_json,
            commands::reading_import_csv,
            commands::reading_open_notes,
```

- [ ] **Step 3: 编译**

Run: `cd src-tauri && cargo build`
Expected: 编译通过(可能报 `import_csv` 未导出但已用,会有 unused warning,加 `#[allow(dead_code)]` 在该函数上一行;这是后端"占位"实现,真正的 CSV 解析在前端)。

- [ ] **Step 4: 写最小集成测试**

在 `commands.rs` 末尾(若不存在 `#[cfg(test)] mod tests` 则新建)中追加:

```rust
    #[test]
    fn reading_crud_roundtrip() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::register_cjk_space(&conn).unwrap();
        conn.execute_batch(crate::db::SCHEMA_V9).unwrap();
        conn.execute_batch(crate::db::SEARCH_TRIGGERS).unwrap();
        conn.execute_batch(crate::db::MIGRATE_V10).unwrap();
        crate::db::migrate(&conn).unwrap();

        let item = ReadingItem {
            id: "r1".into(),
            kind: "book".into(),
            title: "预算管理".into(),
            creator: Some("张三".into()),
            source_url: None,
            status: "wishlist".into(),
            rating: None,
            progress_total: Some(300),
            progress_current: Some(50),
            cover_path: None,
            started_at: None,
            finished_at: None,
            created_at: "2026-09-11T00:00:00".into(),
            updated_at: "2026-09-11T00:00:00".into(),
            notes_id: None,
        };
        conn.execute(crate::models::READING_INSERT, params![
            item.id, item.kind, item.title, item.creator, item.source_url,
            item.status, item.rating, item.progress_total, item.progress_current,
            item.cover_path, item.started_at, item.finished_at,
            item.created_at, item.updated_at, item.notes_id,
        ]).unwrap();
        let all = crate::db::query_all_reading(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].title, "预算管理");
    }
```

- [ ] **Step 5: 运行测试**

Run: `cd src-tauri && cargo test reading_crud_roundtrip`
Expected: PASS

- [ ] **Step 6: 全量 cargo test**

Run: `cd src-tauri && cargo test`
Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(commands): reading_* 8 个 Tauri 命令"
```

### Task 6: flashcard_* Tauri 命令 + SM-2 纯函数

**Files:**
- Create: `src-tauri/src/flashcard.rs` (新文件,SM-2 纯函数 + 段 hash 工具)
- Modify: `src-tauri/src/lib.rs:5-10` (`mod backup;` 之后加 `mod flashcard;`)
- Modify: `src-tauri/src/commands.rs:751+` (末尾追加 6 个 flashcard 命令)
- Modify: `src-tauri/src/lib.rs` (在 `invoke_handler!` 列表末尾追加 6 个 flashcard 命令名)

**Interfaces:**
- Consumes: `FlashcardCard` / `FlashcardReview` (Task 3)
- Produces: 6 个 `#[tauri::command]`: `flashcard_create`、`flashcard_list_by_note`、`flashcard_list_due`、`flashcard_review`、`flashcard_delete`、`flashcard_source_status`;以及纯函数 `next_schedule(review, grade, now)`、`segment_hash(text)`、`resolve_segment(text, offset, length)`(带越界校正)

- [ ] **Step 1: 创建 `src-tauri/src/flashcard.rs`**

```rust
//! 闪卡：纯函数 + 段 hash 工具。
//! 段 hash 用 SHA-256 of UTF-8 文本（前端用 SubtleCrypto.digest；后端用 sha2）。

use crate::models::FlashcardReview;

/// SM-2 简化版：4 档打分。
/// - 1 (重来)   : lapses+=1, reps=0,    interval=1, factor 不变
/// - 2 (困难)   : interval=max(prev*1.2, 1.05), factor=max(prev-0.15, 1.3)
/// - 3 (良好)   : interval=max(prev*prev_factor, 1.5), factor 不变
/// - 4 (简单)   : interval=prev*2.0,   factor=min(prev+0.1, 2.8)
pub fn next_schedule(prev: &FlashcardReview, grade: i64, now_iso: &str) -> FlashcardReview {
    let mut r = prev.clone();
    match grade {
        1 => {
            r.lapses += 1;
            r.reps = 0;
            r.interval_days = 1.0;
        }
        2 => {
            r.interval_days = (prev.interval_days * 1.2).max(1.05);
            r.factor = (prev.factor - 0.15).max(1.3);
            r.reps += 1;
        }
        3 => {
            r.interval_days = (prev.interval_days * prev.factor).max(1.5);
            r.reps += 1;
        }
        4 => {
            r.interval_days = prev.interval_days * 2.0;
            r.factor = (prev.factor + 0.1).min(2.8);
            r.reps += 1;
        }
        _ => {
            // 非法 grade 视作重来,容错。
            r.lapses += 1;
            r.reps = 0;
            r.interval_days = 1.0;
        }
    }
    r.next_due = add_days_iso(now_iso, r.interval_days);
    r
}

fn add_days_iso(now_iso: &str, days: f64) -> String {
    // now_iso 形如 "2026-09-11T08:00:00"；加 days 天,保留时分秒不变。
    // 用 chrono 解析；若解析失败,原样返回（极端情况,容错）。
    use chrono::{DateTime, Duration, Utc};
    match DateTime::parse_from_rfc3339(now_iso) {
        Ok(dt) => {
            let new = dt + Duration::milliseconds((days * 86_400_000.0) as i64);
            new.with_timezone(&Utc).to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        }
        Err(_) => now_iso.to_string(),
    }
}

/// 计算段文本 SHA-256（十六进制,小写）。用 sha2 crate。
pub fn segment_hash(text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(text.as_bytes());
    let out = h.finalize();
    out.iter().map(|b| format!("{b:02x}")).collect()
}

/// 段解析：offset/length 可能越界（速记被改短）。返回 (clamped_text, clamped_offset, clamped_length, valid)。
pub fn resolve_segment(content: &str, offset: i64, length: i64) -> (String, i64, i64, bool) {
    let chars: Vec<char> = content.chars().collect();
    let len = chars.len() as i64;
    let mut o = offset.max(0);
    let mut l = length;
    let mut valid = true;
    if o >= len {
        // 越界：夹回末尾,标 invalid。
        o = len;
        l = 0;
        valid = false;
    } else if o + l > len {
        l = len - o;
        valid = false;
    }
    let text: String = chars.iter().skip(o as usize).take(l as usize).collect();
    (text, o, l, valid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rev() -> FlashcardReview {
        FlashcardReview {
            card_id: "c1".into(),
            next_due: "2026-09-11T00:00:00Z".into(),
            interval_days: 1.0,
            factor: 2.0,
            reps: 0,
            lapses: 0,
        }
    }

    #[test]
    fn grade_1_resets_and_short_interval() {
        let r = next_schedule(&rev(), 1, "2026-09-11T08:00:00Z");
        assert_eq!(r.lapses, 1);
        assert_eq!(r.reps, 0);
        assert_eq!(r.interval_days, 1.0);
    }

    #[test]
    fn grade_2_clamps_factor_to_1_3() {
        let mut p = rev();
        p.factor = 1.4;
        let r = next_schedule(&p, 2, "2026-09-11T08:00:00Z");
        assert!(r.factor >= 1.3);
        assert!(r.interval_days >= 1.05);
    }

    #[test]
    fn grade_3_uses_prev_factor_and_clamps_interval() {
        let mut p = rev();
        p.factor = 2.0;
        let r = next_schedule(&p, 3, "2026-09-11T08:00:00Z");
        assert!(r.interval_days >= 1.5);
    }

    #[test]
    fn grade_4_clamps_factor_to_2_8() {
        let mut p = rev();
        p.factor = 2.7;
        let r = next_schedule(&p, 4, "2026-09-11T08:00:00Z");
        assert!(r.factor <= 2.8);
        assert_eq!(r.interval_days, p.interval_days * 2.0);
    }

    #[test]
    fn resolve_segment_clamps_when_shortened() {
        let content = "abcdef";
        let (text, o, l, valid) = resolve_segment(content, 0, 10);
        assert_eq!(text, "abcdef");
        assert_eq!(o, 0);
        assert_eq!(l, 6);
        assert!(!valid);
    }

    #[test]
    fn resolve_segment_handles_offset_past_end() {
        let (text, o, l, valid) = resolve_segment("abc", 10, 5);
        assert_eq!(text, "");
        assert_eq!(o, 3);
        assert_eq!(l, 0);
        assert!(!valid);
    }

    #[test]
    fn segment_hash_is_deterministic() {
        let a = segment_hash("预算管理");
        let b = segment_hash("预算管理");
        assert_eq!(a, b);
        assert_ne!(a, segment_hash("预算管理1"));
        assert_eq!(a.len(), 64);
    }
}
```

- [ ] **Step 2: 在 `lib.rs` 注册 `mod flashcard;`**

将 `mod backup;` 那一行后追加 `mod flashcard;`。

- [ ] **Step 3: 写 SM-2 纯函数测试**

Run: `cd src-tauri && cargo test flashcard`
Expected: 7 个测试 PASS。

- [ ] **Step 4: 在 `commands.rs` 末尾追加 flashcard 命令**

```rust
#[tauri::command]
pub fn flashcard_create(
    db: DbState,
    note_id: String,
    seg_offset: i64,
    seg_length: i64,
    seg_text: String,
) -> Result<FlashcardCard, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let card = FlashcardCard {
        id: gen_id(),
        note_id: note_id.clone(),
        seg_offset,
        seg_length,
        seg_hash: crate::flashcard::segment_hash(&seg_text),
        created_at: now_iso(),
    };
    conn.execute(
        crate::models::FLASHCARD_CARD_INSERT,
        params![card.id, card.note_id, card.seg_offset, card.seg_length, card.seg_hash, card.created_at],
    ).map_err(|e| e.to_string())?;
    // 初始化 review 行
    let today = now_iso();
    conn.execute(
        crate::models::FLASHCARD_REVIEW_UPSERT,
        params![card.id, today, 1.0_f64, 2.0_f64, 0_i64, 0_i64],
    ).map_err(|e| e.to_string())?;
    Ok(card)
}

#[tauri::command]
pub fn flashcard_list_by_note(db: DbState, note_id: String) -> Result<Vec<FlashcardCard>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    crate::db::query_all_flashcards_by_note(&conn, &note_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn flashcard_list_due(
    db: DbState,
    today: String,
) -> Result<Vec<FlashcardDue>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let rows = crate::db::query_flashcards_due(&conn, &today).map_err(|e| e.to_string())?;
    // 校验每张卡的 hash 与当前 note.content 的 hash
    let mut out = Vec::with_capacity(rows.len());
    for (card, note_title, seg_text) in rows {
        let (cur_text, _o, _l, valid) = {
            let content: String = conn
                .query_row("SELECT content FROM notes WHERE id = ?1", params![card.note_id], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            crate::flashcard::resolve_segment(&content, card.seg_offset, card.seg_length)
        };
        let _ = seg_text; // 已从 join 取
        out.push(FlashcardDue {
            card,
            note_title,
            seg_text: cur_text,
            valid,
        });
    }
    Ok(out)
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardDue {
    #[serde(flatten)]
    pub card: FlashcardCard,
    pub note_title: String,
    pub seg_text: String,
    pub valid: bool,
}

#[tauri::command]
pub fn flashcard_review(
    db: DbState,
    card_id: String,
    grade: i64,
) -> Result<FlashcardReview, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let prev = crate::db::query_flashcard_review(&conn, &card_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("flashcard review for {card_id} not found"))?;
    let now = now_iso();
    let next = crate::flashcard::next_schedule(&prev, grade, &now);
    conn.execute(
        crate::models::FLASHCARD_REVIEW_UPSERT,
        params![next.card_id, next.next_due, next.interval_days, next.factor, next.reps, next.lapses],
    ).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
pub fn flashcard_delete(db: DbState, card_id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // flashcard_reviews 由 ON DELETE CASCADE 跟随删除
    conn.execute("DELETE FROM flashcard_cards WHERE id = ?1", params![card_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn flashcard_source_status(
    db: DbState,
    note_id: String,
) -> Result<Vec<FlashcardSourceStatus>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let cards = crate::db::query_all_flashcards_by_note(&conn, &note_id).map_err(|e| e.to_string())?;
    let content: String = conn.query_row("SELECT content FROM notes WHERE id = ?1", params![note_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(cards.len());
    for c in cards {
        let (cur_text, o, l, valid) = crate::flashcard::resolve_segment(&content, c.seg_offset, c.seg_length);
        let cur_hash = crate::flashcard::segment_hash(&cur_text);
        out.push(FlashcardSourceStatus {
            card_id: c.id,
            seg_offset: o,
            seg_length: l,
            seg_hash: c.seg_hash.clone(),
            current_hash: cur_hash,
            valid: valid && cur_hash == c.seg_hash,
        });
    }
    Ok(out)
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardSourceStatus {
    pub card_id: String,
    pub seg_offset: i64,
    pub seg_length: i64,
    pub seg_hash: String,
    pub current_hash: String,
    pub valid: bool,
}
```

- [ ] **Step 5: 在 `lib.rs` `invoke_handler!` 列表末尾追加 6 个命令**

```rust
            commands::flashcard_create,
            commands::flashcard_list_by_note,
            commands::flashcard_list_due,
            commands::flashcard_review,
            commands::flashcard_delete,
            commands::flashcard_source_status,
```

- [ ] **Step 6: 编译 + 测试**

Run: `cd src-tauri && cargo test`
Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/flashcard.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(commands): flashcard_* 6 个 Tauri 命令与 SM-2 纯函数"
```

---

## 阶段 3:前端基础设施 + 阅读清单页

### Task 7: 前端类型 + 模块元数据注册

**Files:**
- Modify: `src/types.ts:32-44` (在 `NoteInput` 后追加)
- Modify: `src/modules/meta.ts` (在末尾的 links 块后追加 reading + flashcards)
- Modify: `src/modules/registry.ts:8-17` (`ROUTES` 加 2 行)
- Modify: `src/modules/registry.ts:19-29` (`COMPONENTS` 加 2 行)

**Interfaces:**
- Consumes: 后端模型 (Task 3)
- Produces: 前端 `ReadingItem` / `ReadingItemInput` / `FlashcardCard` / `FlashcardReview` / `FlashcardDue` / `FlashcardSourceStatus` / `FlashcardGrade`

- [ ] **Step 1: 在 `src/types.ts` 末尾追加类型**

```ts
// === 阅读清单 ===
export type ReadingKind = 'book' | 'movie' | 'tv' | 'podcast' | 'article' | 'other';
export type ReadingStatus = 'wishlist' | 'in_progress' | 'done' | 'paused' | 'dropped';

export interface ReadingItem {
  id: string;
  kind: ReadingKind;
  title: string;
  creator?: string;
  sourceUrl?: string;
  status: ReadingStatus;
  rating?: number;
  progressTotal?: number;
  progressCurrent?: number;
  coverPath?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
  notesId?: string;
}

export interface ReadingItemInput {
  kind: ReadingKind;
  title: string;
  creator?: string;
  sourceUrl?: string;
  status?: ReadingStatus;
  rating?: number;
  progressTotal?: number;
  progressCurrent?: number;
  coverPath?: string;
  startedAt?: string;
  finishedAt?: string;
  notesId?: string;
}

export const READING_KIND_LABEL: Record<ReadingKind, string> = {
  book: '书',
  movie: '影',
  tv: '剧',
  podcast: '播客',
  article: '文章',
  other: '其他',
};

export const READING_KIND_COLOR: Record<ReadingKind, string> = {
  book: '#0ea5a0',
  movie: '#ec4899',
  tv: '#8b5cf6',
  podcast: '#f59e0b',
  article: '#22c55e',
  other: '#6b7280',
};

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  wishlist: '想看',
  in_progress: '在读',
  done: '已完',
  paused: '暂停',
  dropped: '弃坑',
};

// === 闪卡 ===
export type FlashcardGrade = 1 | 2 | 3 | 4;

export interface FlashcardCard {
  id: string;
  noteId: string;
  segOffset: number;
  segLength: number;
  segHash: string;
  createdAt: string;
}

export interface FlashcardReview {
  cardId: string;
  nextDue: string;
  intervalDays: number;
  factor: number;
  reps: number;
  lapses: number;
}

export interface FlashcardDue {
  id: string;
  noteId: string;
  segOffset: number;
  segLength: number;
  segHash: string;
  createdAt: string;
  noteTitle: string;
  segText: string;
  valid: boolean;
}

export interface FlashcardSourceStatus {
  cardId: string;
  segOffset: number;
  segLength: number;
  segHash: string;
  currentHash: string;
  valid: boolean;
}

export const FLASHCARD_GRADE_LABEL: Record<FlashcardGrade, string> = {
  1: '重来',
  2: '困难',
  3: '良好',
  4: '简单',
};
```

- [ ] **Step 2: 在 `src/modules/meta.ts` 末尾(links 块之后)追加**

```ts
  {
    id: 'reading',
    name: '阅读清单',
    icon: '📚',
    description: '书/影/剧/播客/文章清单',
    defaultEnabled: true,
    color: '#0ea5a0',
  },
  {
    id: 'flashcards',
    name: '知识卡',
    icon: '🧠',
    description: '速记 ⭐ 摘录自动进复习',
    defaultEnabled: true,
    color: '#8b5cf6',
  },
```

- [ ] **Step 3: 在 `src/modules/registry.ts` 追加 ROUTES 与 COMPONENTS 各 2 行**

```ts
const ROUTES: Record<string, string> = {
  // ... 已有项 ...
  reading: '/reading',
  flashcards: '/flashcards',
};

const COMPONENTS: Record<string, ComponentType> = {
  // ... 已有项 ...
  reading: ReadingPage,
  flashcards: FlashcardsPage,
};
```

(ReadingPage / FlashcardsPage 占位组件在 Task 9 / 14 创建,先写 import。)

- [ ] **Step 4: 在 `registry.ts` 顶部 import 区追加**

```ts
import ReadingPage from '../features/reading/ReadingPage';
import FlashcardsPage from '../features/flashcards/FlashcardsPage';
```

- [ ] **Step 5: 创建占位组件 `src/features/reading/ReadingPage.tsx` 与 `src/features/flashcards/FlashcardsPage.tsx`(各自仅一个 div)**

```tsx
// src/features/reading/ReadingPage.tsx
export default function ReadingPage() {
  return <div>阅读清单（占位,Task 9 替换）</div>;
}
```

```tsx
// src/features/flashcards/FlashcardsPage.tsx
export default function FlashcardsPage() {
  return <div>知识卡（占位,Task 14 替换）</div>;
}
```

- [ ] **Step 6: 运行前端编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/modules/meta.ts src/modules/registry.ts src/features/reading/ReadingPage.tsx src/features/flashcards/FlashcardsPage.tsx
git commit -m "feat(ui): 注册 reading/flashcards 模块元数据与占位组件"
```

### Task 8: 阅读清单纯函数 (TDD)

**Files:**
- Create: `src/features/reading/reading.ts`
- Create: `src/features/reading/reading.test.ts`
- Create: `src/features/reading/csv.ts` (CSV 解析)
- Create: `src/features/reading/csv.test.ts`

**Interfaces:**
- Consumes: `ReadingItem` / `ReadingItemInput` (Task 7)
- Produces: 纯函数 `filterByStatus(items, status)`、`searchReading(items, kw)`、`groupByStatus(items)` → 5 桶、`progressPercent(item)`、`progressText(item)`、`csvParse(text)` → `{ok, rows, errors}`、`csvStringify(rows)`

- [ ] **Step 1: 写 `reading.ts` 纯函数测试 `src/features/reading/reading.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { ReadingItem } from '../../types';
import { filterByStatus, searchReading, groupByStatus, progressPercent, progressText } from './reading';

const items: ReadingItem[] = [
  { id: '1', kind: 'book', title: '预算管理', creator: '张三', status: 'wishlist', createdAt: '2026-09-01', updatedAt: '2026-09-01' },
  { id: '2', kind: 'movie', title: '星际穿越', status: 'done', rating: 5, createdAt: '2026-08-01', updatedAt: '2026-08-15', finishedAt: '2026-08-15' },
  { id: '3', kind: 'book', title: '深入理解计算机系统', status: 'in_progress', progressTotal: 800, progressCurrent: 200, createdAt: '2026-07-01', updatedAt: '2026-09-10' },
];

describe('filterByStatus', () => {
  it('空字符串返回全部', () => {
    expect(filterByStatus(items, '').length).toBe(3);
  });
  it('按状态过滤', () => {
    expect(filterByStatus(items, 'done').map((i) => i.id)).toEqual(['2']);
  });
});

describe('searchReading', () => {
  it('关键字匹配标题', () => {
    expect(searchReading(items, '预算').map((i) => i.id)).toEqual(['1']);
  });
  it('关键字匹配作者', () => {
    expect(searchReading(items, '张').map((i) => i.id)).toEqual(['1']);
  });
  it('空关键字返回全部', () => {
    expect(searchReading(items, '').length).toBe(3);
  });
  it('大小写不敏感', () => {
    expect(searchReading(items, 'BOOK').length).toBe(2); // 通过 kind 走不到,这里验证大小写不破坏
  });
});

describe('groupByStatus', () => {
  it('按 5 桶分组', () => {
    const g = groupByStatus(items);
    expect(g.wishlist.length).toBe(1);
    expect(g.in_progress.length).toBe(1);
    expect(g.done.length).toBe(1);
    expect(g.paused.length).toBe(0);
    expect(g.dropped.length).toBe(0);
  });
});

describe('progressPercent', () => {
  it('无 total 返回 0', () => {
    expect(progressPercent(items[0])).toBe(0);
  });
  it('current/total*100 向下取整', () => {
    expect(progressPercent(items[2])).toBe(25);
  });
  it('current > total 钳到 100', () => {
    const x = { ...items[2], progressCurrent: 9999 } as ReadingItem;
    expect(progressPercent(x)).toBe(100);
  });
});

describe('progressText', () => {
  it('有 total 显示 X / Y', () => {
    expect(progressText(items[2])).toBe('200 / 800');
  });
  it('无 total 返回空串', () => {
    expect(progressText(items[0])).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- --run reading.test`
Expected: 失败（模块不存在）。

- [ ] **Step 3: 实现 `src/features/reading/reading.ts`**

```ts
import type { ReadingItem, ReadingStatus } from '../../types';

export function filterByStatus(items: ReadingItem[], status: string): ReadingItem[] {
  if (!status) return items;
  return items.filter((i) => i.status === status);
}

export function searchReading(items: ReadingItem[], keyword: string): ReadingItem[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return items;
  return items.filter((i) => {
    if (i.title.toLowerCase().includes(k)) return true;
    if (i.creator?.toLowerCase().includes(k)) return true;
    if (i.sourceUrl?.toLowerCase().includes(k)) return true;
    return false;
  });
}

export function groupByStatus(items: ReadingItem[]): Record<ReadingStatus, ReadingItem[]> {
  const out: Record<ReadingStatus, ReadingItem[]> = {
    wishlist: [],
    in_progress: [],
    done: [],
    paused: [],
    dropped: [],
  };
  for (const i of items) out[i.status].push(i);
  return out;
}

export function progressPercent(item: ReadingItem): number {
  if (!item.progressTotal || item.progressTotal <= 0) return 0;
  const cur = Math.max(0, item.progressCurrent ?? 0);
  return Math.min(100, Math.floor((cur / item.progressTotal) * 100));
}

export function progressText(item: ReadingItem): string {
  if (!item.progressTotal) return '';
  return `${item.progressCurrent ?? 0} / ${item.progressTotal}`;
}
```

- [ ] **Step 4: 跑测试**

Run: `npm test -- --run reading.test`
Expected: 全部 PASS。

- [ ] **Step 5: 写 `csv.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { csvParse, csvStringify } from './csv';

describe('csvParse', () => {
  it('标准 RFC 4180 解析', () => {
    const text = `kind,title,creator,status,rating,progress_total,progress_current
book,预算管理,张三,wishlist,,300,50
movie,星际穿越,,done,5,,`;
    const r = csvParse(text);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { kind: 'book', title: '预算管理', creator: '张三', status: 'wishlist', rating: '', progress_total: '300', progress_current: '50' },
      { kind: 'movie', title: '星际穿越', creator: '', status: 'done', rating: '5', progress_total: '', progress_current: '' },
    ]);
  });

  it('双引号转义含逗号字段', () => {
    const text = `kind,title,creator,status
book,"Hello, World",x,wishlist`;
    const r = csvParse(text);
    expect(r.rows[0].title).toBe('Hello, World');
  });

  it('缺列报错行级报告', () => {
    const text = `kind,title
book,预算管理`;
    const r = csvParse(text);
    expect(r.errors.some((e) => e.includes('creator'))).toBe(true);
  });
});

describe('csvStringify', () => {
  it('含逗号字段加引号', () => {
    expect(csvStringify([{ a: 'x,y', b: 'z' }])).toBe('a,b\n"x,y",z');
  });
});
```

- [ ] **Step 6: 实现 `csv.ts`**

```ts
export interface CsvResult {
  rows: Record<string, string>[];
  errors: string[];
}

const REQUIRED = ['kind', 'title', 'creator', 'status', 'rating', 'progress_total', 'progress_current'];

/** RFC 4180 简化：支持双引号包字段、"" 转义 "、换行 \r?\n。 */
export function csvParse(text: string): CsvResult {
  const out: Record<string, string>[] = [];
  const errors: string[] = [];
  const lines = parseRows(text);
  if (lines.length === 0) return { rows: [], errors: ['empty'] };
  const header = lines[0].map((s) => s.trim());
  for (const need of REQUIRED) {
    if (!header.includes(need)) errors.push(`缺少必需列：${need}`);
  }
  if (errors.length) return { rows: [], errors };
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.length === 1 && cells[0] === '') continue; // 空行
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = (cells[j] ?? '').trim();
    }
    out.push(row);
  }
  return { rows: out, errors };
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

export function csvStringify(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const head = cols.join(',');
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const v = r[c] ?? '';
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(',')
    )
    .join('\n');
  return `${head}\n${body}`;
}
```

- [ ] **Step 7: 跑 CSV 测试**

Run: `npm test -- --run csv.test`
Expected: 全部 PASS。

- [ ] **Step 8: Commit**

```bash
git add src/features/reading/reading.ts src/features/reading/reading.test.ts src/features/reading/csv.ts src/features/reading/csv.test.ts
git commit -m "feat(reading): 纯函数 + CSV 解析 TDD"
```

### Task 9: 阅读清单页（列表 + 抽屉）

**Files:**
- Modify: `src/features/reading/ReadingPage.tsx` (替换占位)

**Interfaces:**
- Consumes: Tauri 命令 `reading_list` / `reading_create` / `reading_update` / `reading_delete` / `reading_open_notes`(Task 5)
- Produces: 完整模块页 + 极简卡 + 详情抽屉

- [ ] **Step 1: 实现 `ReadingPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type {
  ReadingItem,
  ReadingItemInput,
  ReadingKind,
  ReadingStatus,
} from '../../types';
import {
  READING_KIND_COLOR,
  READING_KIND_LABEL,
  READING_STATUS_LABEL,
} from '../../types';
import { filterByStatus, groupByStatus, progressPercent, progressText, searchReading } from './reading';
import './reading.css';

type Tab = 'wishlist' | 'in_progress' | 'done' | 'paused' | 'dropped' | 'all';

export default function ReadingPage() {
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [tab, setTab] = useState<Tab>('wishlist');
  const [kw, setKw] = useState('');
  const [editing, setEditing] = useState<ReadingItem | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const reload = async () => {
    const list = await invoke<ReadingItem[]>('reading_list');
    setItems(list);
  };
  useEffect(() => { void reload(); }, []);

  const visible = useMemo(() => {
    let xs = items;
    if (tab !== 'all') xs = filterByStatus(xs, tab);
    xs = searchReading(xs, kw);
    return xs;
  }, [items, tab, kw]);

  const groups = useMemo(() => groupByStatus(items), [items]);
  const tabsCount = useMemo(
    () => ({
      wishlist: groups.wishlist.length,
      in_progress: groups.in_progress.length,
      done: groups.done.length,
      paused: groups.paused.length,
      dropped: groups.dropped.length,
      all: items.length,
    }),
    [groups, items.length]
  );

  const onCreate = () => setEditing({
    id: '',
    kind: 'book',
    title: '',
    status: 'wishlist',
    createdAt: '',
    updatedAt: '',
  } as ReadingItem);

  const onSave = async (input: ReadingItemInput, id: string | null) => {
    if (id) await invoke('reading_update', { id, patch: input });
    else await invoke('reading_create', { input });
    setEditing(null);
    await reload();
  };

  const onDelete = async (id: string) => {
    if (!confirm('确认删除？')) return;
    await invoke('reading_delete', { id });
    await reload();
  };

  const onComplete = async (it: ReadingItem) => {
    const rating = window.prompt('评分 0-5（可空跳过）', '');
    const r = rating === null || rating === '' ? undefined : Math.max(0, Math.min(5, Number(rating)));
    await invoke('reading_update', {
      id: it.id,
      patch: { ...it, status: 'done', rating: r ?? it.rating, finishedAt: new Date().toISOString() },
    });
    await reload();
  };

  const onOpenNotes = async (it: ReadingItem) => {
    setOpening(it.id);
    try {
      const noteId = await invoke<string>('reading_open_notes', { id: it.id });
      // 切到 notes 模块并选中。简化：跳到 /notes?select=<id>
      window.location.hash = `#/notes?select=${noteId}`;
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="reading-page">
      <header className="reading-stats">
        <span>想看 {tabsCount.wishlist}</span>
        <span>· 在读 {tabsCount.in_progress}</span>
        <span>· 已完 {tabsCount.done}</span>
        <span>· 共 {tabsCount.all}</span>
      </header>

      <div className="reading-toolbar">
        <input
          className="reading-search"
          placeholder="搜索 标题 / 作者 / 链接"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
        <button className="btn primary" onClick={onCreate}>+ 新建</button>
      </div>

      <nav className="reading-tabs">
        {(['wishlist','in_progress','done','paused','dropped','all'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`reading-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'all' ? '全部' : READING_STATUS_LABEL[t]} <small>{tabsCount[t]}</small>
          </button>
        ))}
      </nav>

      <ul className="reading-grid">
        {visible.map((it) => (
          <li key={it.id} className="reading-card" onClick={() => setEditing(it)}>
            <div className="reading-card-cover" style={{ background: READING_KIND_COLOR[it.kind] }}>
              {it.coverPath ? <img src={it.coverPath} alt={it.title} /> : <span>{READING_KIND_LABEL[it.kind]}</span>}
            </div>
            <div className="reading-card-body">
              <div className="reading-card-title">{it.title}</div>
              {it.creator && <div className="reading-card-creator">{it.creator}</div>}
              {it.progressTotal != null && (
                <div className="reading-card-progress">
                  <div className="bar"><div className="fill" style={{ width: `${progressPercent(it)}%` }} /></div>
                  <small>{progressText(it)}</small>
                </div>
              )}
              {it.status === 'done' && it.rating != null && (
                <div className="reading-card-stars">{'★'.repeat(it.rating)}{'☆'.repeat(5 - it.rating)}</div>
              )}
            </div>
            <div className="reading-card-actions" onClick={(e) => e.stopPropagation()}>
              {it.status !== 'done' && (
                <button onClick={() => onComplete(it)}>完成</button>
              )}
              <button onClick={() => onOpenNotes(it)} disabled={opening === it.id}>
                {it.notesId ? '打开配套速记' : '+ 配套速记'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <ReadingDrawer
          item={editing}
          onClose={() => setEditing(null)}
          onSave={onSave}
          onDelete={editing.id ? () => onDelete(editing.id) : null}
        />
      )}
    </div>
  );
}

function ReadingDrawer({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: ReadingItem;
  onClose: () => void;
  onSave: (i: ReadingItemInput, id: string | null) => void;
  onDelete: (() => void) | null;
}) {
  const [draft, setDraft] = useState<ReadingItemInput>({
    kind: item.kind,
    title: item.title,
    creator: item.creator,
    sourceUrl: item.sourceUrl,
    status: item.status,
    rating: item.rating,
    progressTotal: item.progressTotal,
    progressCurrent: item.progressCurrent,
    coverPath: item.coverPath,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    notesId: item.notesId,
  });

  const onPickCover = async () => {
    const p = await openDialog({ multiple: false, filters: [{ name: 'image', extensions: ['png','jpg','jpeg','webp'] }] });
    if (typeof p === 'string') setDraft({ ...draft, coverPath: p });
  };

  return (
    <div className="reading-drawer-backdrop" onClick={onClose}>
      <aside className="reading-drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{item.id ? '编辑' : '新建'}阅读清单项</h3>
          <button onClick={onClose}>×</button>
        </header>
        <label>类型
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ReadingKind })}>
            {Object.entries(READING_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>标题<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label>作者/导演/主播<input value={draft.creator ?? ''} onChange={(e) => setDraft({ ...draft, creator: e.target.value })} /></label>
        <label>源 URL<input value={draft.sourceUrl ?? ''} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} /></label>
        <label>状态
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ReadingStatus })}>
            {Object.entries(READING_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>总页/集<input type="number" value={draft.progressTotal ?? ''} onChange={(e) => setDraft({ ...draft, progressTotal: e.target.value ? Number(e.target.value) : undefined })} /></label>
        <label>当前页/集<input type="number" value={draft.progressCurrent ?? ''} onChange={(e) => setDraft({ ...draft, progressCurrent: e.target.value ? Number(e.target.value) : undefined })} /></label>
        <label>评分 0-5<input type="number" min={0} max={5} value={draft.rating ?? ''} onChange={(e) => setDraft({ ...draft, rating: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
        <div className="reading-drawer-cover">
          {draft.coverPath ? <img src={draft.coverPath} alt="封面" /> : <em>未选封面</em>}
          <button onClick={onPickCover}>选封面</button>
        </div>
        <footer>
          {onDelete && <button className="danger" onClick={onDelete}>删除</button>}
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={!draft.title.trim()} onClick={() => onSave(draft, item.id || null)}>保存</button>
        </footer>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: 创建 `src/features/reading/reading.css`**

```css
.reading-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.reading-stats { display: flex; gap: 12px; color: var(--text-2); font-size: 13px; }
.reading-toolbar { display: flex; gap: 8px; }
.reading-search { flex: 1; }
.reading-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.reading-tab { padding: 6px 12px; border-radius: var(--radius); background: var(--panel); border: 1px solid var(--border); cursor: pointer; }
.reading-tab.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.reading-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; list-style: none; padding: 0; }
.reading-card { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; cursor: pointer; transition: transform 120ms, box-shadow 120ms; }
.reading-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-1); }
.reading-card-cover { aspect-ratio: 4/5; display: flex; align-items: center; justify-content: center; color: white; font-size: 28px; overflow: hidden; }
.reading-card-cover img { width: 100%; height: 100%; object-fit: cover; }
.reading-card-body { padding: 8px 12px; flex: 1; }
.reading-card-title { font-weight: 600; }
.reading-card-creator { color: var(--text-2); font-size: 12px; }
.reading-card-progress .bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin: 6px 0 2px; }
.reading-card-progress .fill { height: 100%; background: var(--accent); }
.reading-card-progress small { color: var(--text-2); font-size: 11px; }
.reading-card-stars { color: var(--accent); font-size: 14px; }
.reading-card-actions { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border); }
.reading-card-actions button { flex: 1; font-size: 12px; padding: 4px 8px; }
.reading-drawer-backdrop { position: fixed; inset: 0; background: var(--overlay); display: flex; justify-content: flex-end; z-index: 100; }
.reading-drawer { width: 420px; max-width: 90vw; background: var(--panel-pop); padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; border-left: 1px solid var(--border-strong); }
.reading-drawer header { display: flex; justify-content: space-between; align-items: center; }
.reading-drawer label { display: flex; flex-direction: column; font-size: 12px; color: var(--text-2); gap: 4px; }
.reading-drawer input, .reading-drawer select { padding: 6px 8px; }
.reading-drawer footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: auto; }
.reading-drawer-cover { display: flex; gap: 12px; align-items: center; }
.reading-drawer-cover img { max-width: 80px; max-height: 100px; }
.btn.danger { color: #ef4444; }
```

- [ ] **Step 3: 前端编译**

Run: `npm run build`
Expected: 编译通过。

- [ ] **Step 4: 启动 dev 模式,人工点 5 张卡 + 配套速记,确认跳转**

Run: `npm run tauri dev`（手动验收,不必 commit 时长跑）
Expected: 6 个 tab 切换正确；点击"打开配套速记"无 notes_id 时跳到新速记,有 notes_id 时跳到原速记；封面选择走系统对话框。

- [ ] **Step 5: Commit**

```bash
git add src/features/reading/ReadingPage.tsx src/features/reading/reading.css
git commit -m "feat(reading): 模块页 + 极简卡 + 详情抽屉"
```

### Task 10: 阅读清单导入（JSON/CSV）

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx` (在"数据"区加按钮 + 处理函数)

**Interfaces:**
- Consumes: `reading_list` / `reading_import_json` Tauri 命令(已存在);`csvParse`(Task 8);`save`(Tauri dialog);`confirm`
- Produces: 设置页"导入阅读清单"按钮,弹文件选择 → 解析 → 预览 → 确认 → 批量创建

- [ ] **Step 1: 在 `SettingsPage.tsx` 顶部 import 追加**

```ts
import { csvParse } from '../reading/csv';
import type { ReadingItemInput } from '../../types';
```

- [ ] **Step 2: 在"数据"区(找出包含"备份"按钮的 `<section>` 块)添加按钮**

在 "导出 JSON 备份" 按钮旁追加:

```tsx
<button
  onClick={async () => {
    const p = await open({ multiple: false, filters: [{ name: 'data', extensions: ['json', 'csv'] }] });
    if (!p || typeof p !== 'string') return;
    const text = await readTextFile(p);
    let rows: ReadingItemInput[];
    let errors: string[] = [];
    if (p.endsWith('.csv')) {
      const r = csvParse(text);
      errors = r.errors;
      rows = r.rows.map((row) => ({
        kind: (row.kind as ReadingItemInput['kind']) ?? 'book',
        title: row.title ?? '',
        creator: row.creator || undefined,
        sourceUrl: row.source_url || row.sourceUrl || undefined,
        status: (row.status as ReadingItemInput['status']) ?? 'wishlist',
        rating: row.rating ? Number(row.rating) : undefined,
        progressTotal: row.progress_total ? Number(row.progress_total) : undefined,
        progressCurrent: row.progress_current ? Number(row.progress_current) : undefined,
      }));
    } else {
      const arr = JSON.parse(text);
      rows = arr as ReadingItemInput[];
    }
    if (errors.length) {
      alert('解析报错：\n' + errors.join('\n'));
      return;
    }
    if (!rows.length) { alert('无有效行'); return; }
    if (!confirm(`将创建 ${rows.length} 条阅读清单项，是否继续？`)) return;
    const n = await invoke<number>('reading_import_json', { rows });
    alert(`已导入 ${n} 条`);
  }}
>
  导入阅读清单（JSON/CSV）
</button>
```

- [ ] **Step 3: 编译**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: 手动验收（在 dev 模式）**

- 准备一个 CSV 测试文件 `test-reading.csv`：
```csv
kind,title,creator,status,rating,progress_total,progress_current
book,预算管理,张三,wishlist,,300,50
movie,星际穿越,,done,5,,
```
- dev 模式下点"导入阅读清单" → 选 test-reading.csv → 看到确认弹窗 → 确认 → 列表里出现 2 条

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/SettingsPage.tsx
git commit -m "feat(reading): 设置页导入 JSON/CSV 入口"
```

---

## 阶段 4:闪卡页 + 速记 ⭐ 集成

### Task 11: 前端 SM-2 纯函数 (TDD)

**Files:**
- Create: `src/features/flashcards/flashcards.ts`
- Create: `src/features/flashcards/flashcards.test.ts`

**Interfaces:**
- Consumes: `FlashcardReview` / `FlashcardGrade`(Task 7)
- Produces: 纯函数 `nextSchedule(prev, grade, now)` — 与后端 `flashcard::next_schedule` 行为一致(为离线/乐观更新准备)、`sha256Hex(text)` — 用 `crypto.subtle.digest` + hex

- [ ] **Step 1: 写测试 `flashcards.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { FlashcardReview } from '../../types';
import { nextSchedule } from './flashcards';

function r(over: Partial<FlashcardReview> = {}): FlashcardReview {
  return {
    cardId: 'c1',
    nextDue: '2026-09-11T00:00:00Z',
    intervalDays: 1,
    factor: 2,
    reps: 0,
    lapses: 0,
    ...over,
  };
}

describe('nextSchedule', () => {
  it('grade 1 重置 reps 与 interval=1', () => {
    const out = nextSchedule(r({ reps: 5, intervalDays: 10 }), 1, '2026-09-11T08:00:00Z');
    expect(out.reps).toBe(0);
    expect(out.intervalDays).toBe(1);
    expect(out.lapses).toBe(1);
  });
  it('grade 2 钳 factor >= 1.3', () => {
    const out = nextSchedule(r({ factor: 1.4 }), 2, '2026-09-11T08:00:00Z');
    expect(out.factor).toBeGreaterThanOrEqual(1.3);
  });
  it('grade 3 interval 用 prev*factor 钳 1.5', () => {
    const out = nextSchedule(r({ factor: 2, intervalDays: 1 }), 3, '2026-09-11T08:00:00Z');
    expect(out.intervalDays).toBe(2); // 1*2
  });
  it('grade 4 钳 factor <= 2.8', () => {
    const out = nextSchedule(r({ factor: 2.7, intervalDays: 5 }), 4, '2026-09-11T08:00:00Z');
    expect(out.factor).toBe(2.8);
    expect(out.intervalDays).toBe(10);
  });
});
```

- [ ] **Step 2: 实现 `flashcards.ts`**

```ts
import type { FlashcardGrade, FlashcardReview } from '../../types';

/** 与后端 flashcard::next_schedule 行为一致；前端用于乐观更新。 */
export function nextSchedule(prev: FlashcardReview, grade: FlashcardGrade, nowIso: string): FlashcardReview {
  const r: FlashcardReview = { ...prev };
  switch (grade) {
    case 1:
      r.lapses += 1;
      r.reps = 0;
      r.intervalDays = 1;
      break;
    case 2:
      r.intervalDays = Math.max(prev.intervalDays * 1.2, 1.05);
      r.factor = Math.max(prev.factor - 0.15, 1.3);
      r.reps += 1;
      break;
    case 3:
      r.intervalDays = Math.max(prev.intervalDays * prev.factor, 1.5);
      r.reps += 1;
      break;
    case 4:
      r.intervalDays = prev.intervalDays * 2.0;
      r.factor = Math.min(prev.factor + 0.1, 2.8);
      r.reps += 1;
      break;
  }
  r.nextDue = addDays(nowIso, r.intervalDays);
  return r;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setTime(d.getTime() + days * 86_400_000);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 3: 跑测试**

Run: `npm test -- --run flashcards.test`
Expected: 全部 PASS（4 个 case）。

- [ ] **Step 4: Commit**

```bash
git add src/features/flashcards/flashcards.ts src/features/flashcards/flashcards.test.ts
git commit -m "feat(flashcards): SM-2 纯函数前端镜像 + sha256 工具"
```

### Task 12: 闪卡模块页（复习模式 + 列表）

**Files:**
- Modify: `src/features/flashcards/FlashcardsPage.tsx` (替换占位)
- Create: `src/features/flashcards/flashcards.css`

**Interfaces:**
- Consumes: Tauri 命令 `flashcard_list_due` / `flashcard_review` / `flashcard_source_status`(Task 6);`nextSchedule`(Task 11)
- Produces: 完整模块页 + 一页一卡复习模式 + 4 档打分按钮

- [ ] **Step 1: 实现 `FlashcardsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FlashcardCard, FlashcardDue, FlashcardGrade, FlashcardReview } from '../../types';
import { FLASHCARD_GRADE_LABEL } from '../../types';
import { nextSchedule } from './flashcards';
import './flashcards.css';

function todayIso(): string {
  return new Date().toISOString();
}

export default function FlashcardsPage() {
  const [due, setDue] = useState<FlashcardDue[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  const reload = async () => {
    const list = await invoke<FlashcardDue[]>('flashcard_list_due', { today: todayIso() });
    setDue(list);
    setIndex(0);
    setFlipped(false);
  };
  useEffect(() => { void reload(); }, []);

  if (due.length === 0) {
    return (
      <div className="flashcards-page empty">
        <h2>🎉 今日没有待复习卡片</h2>
        <p>在速记里选中一段按 ⭐,卡片会进复习池。</p>
      </div>
    );
  }
  if (index >= due.length) {
    return (
      <div className="flashcards-page empty">
        <h2>✅ 今日复习完毕</h2>
        <p>共复习 {done} 张</p>
        <button onClick={reload}>刷新</button>
      </div>
    );
  }

  const card = due[index];

  const onGrade = async (g: FlashcardGrade) => {
    // 乐观更新
    const optimistic: FlashcardReview = {
      cardId: card.id,
      nextDue: '',
      intervalDays: 1,
      factor: 2,
      reps: 0,
      lapses: 0,
    };
    const updated = nextSchedule(optimistic, g, todayIso());
    await invoke('flashcard_review', { cardId: card.id, grade: g });
    setDone((d) => d + 1);
    setIndex((i) => i + 1);
    setFlipped(false);
  };

  return (
    <div className="flashcards-page">
      <header className="flashcards-head">
        <span>复习进度 {index + 1} / {due.length}</span>
        <span>今日完成 {done}</span>
        <button onClick={reload}>× 退出</button>
      </header>
      <div className={`flashcards-card ${flipped ? 'flipped' : ''} ${card.valid ? '' : 'invalid'}`}>
        <div className="flashcards-face flashcards-front">
          <p>{card.segText || '（段内容已丢失,点击查看原速记）'}</p>
          {!card.valid && <small className="warn">⚠ 源已变</small>}
        </div>
        <div className="flashcards-face flashcards-back">
          <p>{card.segText}</p>
        </div>
      </div>
      <footer className="flashcards-foot">
        {!flipped ? (
          <>
            <button onClick={() => window.open(`#/notes?select=${card.noteId}`, '_self')}>查看原速记</button>
            <button className="primary" onClick={() => setFlipped(true)}>翻面</button>
          </>
        ) : (
          <div className="flashcards-grades">
            {([1,2,3,4] as FlashcardGrade[]).map((g) => (
              <button key={g} className={`grade-${g}`} onClick={() => onGrade(g)}>
                {FLASHCARD_GRADE_LABEL[g]}
              </button>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: 创建 `flashcards.css`**

```css
.flashcards-page { padding: 16px; display: flex; flex-direction: column; gap: 12px; min-height: 60vh; }
.flashcards-page.empty { text-align: center; padding: 60px 0; color: var(--text-2); }
.flashcards-head { display: flex; justify-content: space-between; align-items: center; color: var(--text-2); }
.flashcards-card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px; min-height: 200px; position: relative; }
.flashcards-card.invalid { border-color: var(--warn); }
.flashcards-face { font-size: 18px; line-height: 1.6; }
.flashcards-back { display: none; }
.flashcards-card.flipped .flashcards-front { display: none; }
.flashcards-card.flipped .flashcards-back { display: block; }
.flashcards-foot { display: flex; gap: 8px; }
.flashcards-foot button { flex: 1; padding: 12px; }
.flashcards-grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; }
.grade-1 { background: #ef4444; color: white; }
.grade-2 { background: #f59e0b; color: white; }
.grade-3 { background: #22c55e; color: white; }
.grade-4 { background: #0ea5a0; color: white; }
.warn { color: var(--warn); }
```

- [ ] **Step 3: 编译**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/features/flashcards/FlashcardsPage.tsx src/features/flashcards/flashcards.css
git commit -m "feat(flashcards): 复习页 + 一页一卡 4 档打分"
```

### Task 13: 速记 ⭐ 集成 + 反链面板扩展

**Files:**
- Modify: `src/features/notes/NotesPage.tsx:142-180` (编辑器工具栏区域)
- Modify: `src/features/notes/NotesPage.tsx:30-60` (扩展反链面板状态,加 `flashcardStatus`)

**Interfaces:**
- Consumes: Tauri 命令 `flashcard_create` / `flashcard_list_by_note` / `flashcard_source_status`(Task 6);`<textarea>` selectionStart/selectionEnd(已有)
- Produces: 工具栏 ⭐ 按钮(仅当选区非空时启用);段选区浅色底色;反链面板下方"被 ⭐ 为卡片"分区

- [ ] **Step 1: 在 `NotesPage.tsx` 顶部追加 import**

```ts
import type { FlashcardCard, FlashcardSourceStatus } from '../../types';
```

(若与现有 import 风格不一致,合入已有 `import type { Note } from '../../types';` 那行)

- [ ] **Step 2: 在组件 state 区追加**

紧跟 `const [backlinks, setBacklinks] = useState<Note[]>([]);` 之后:

```ts
  const [flashcards, setFlashcards] = useState<FlashcardSourceStatus[]>([]);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);

  // 选中笔记变化：拉取反链 + 该笔记下的卡片源状态
  useEffect(() => {
    if (!selected) { setBacklinks([]); setFlashcards([]); return; }
    void invoke<Note[]>('related_notes', { id: selected.id }).then(setBacklinks);
    void invoke<FlashcardSourceStatus[]>('flashcard_source_status', { noteId: selected.id }).then(setFlashcards);
  }, [selected?.id]);
```

- [ ] **Step 3: 在 `<textarea>` 标签上加 `onSelect` 监听**

找到 `NotesPage.tsx` 中 `<textarea` 那一行,在其属性里追加(注意 React 属性写法):

```tsx
              onSelect={(e) => {
                const t = e.currentTarget;
                if (t.selectionStart === t.selectionEnd) {
                  setSelection(null);
                  return;
                }
                const start = t.selectionStart;
                const end = t.selectionEnd;
                setSelection({ start, end, text: t.value.slice(start, end) });
              }}
```

- [ ] **Step 4: 在工具栏区添加 ⭐ 按钮**

在 NotesPage.tsx 工具栏(notes-editor-head 区)内追加 ⭐ 按钮,只有 `selection` 非空且与当前 selected 笔记时启用:

```tsx
              <button
                className="btn"
                disabled={!selection || !selected}
                onClick={async () => {
                  if (!selected || !selection) return;
                  await invoke('flashcard_create', {
                    noteId: selected.id,
                    segOffset: selection.start,
                    segLength: selection.end - selection.start,
                    segText: selection.text,
                  });
                  setSelection(null);
                  // 重新拉取卡片源状态
                  const fs = await invoke<FlashcardSourceStatus[]>('flashcard_source_status', { noteId: selected.id });
                  setFlashcards(fs);
                }}
                title="将选中段加为闪卡"
              >
                ⭐ 加为闪卡
              </button>
```

- [ ] **Step 5: 在反链面板下方加"被 ⭐ 为卡片"分区**

找到 `<span className="notes-links-label">引用了它</span>` 那一行,在这块 JSX 之后追加:

```tsx
              {flashcards.length > 0 && (
                <div className="notes-flashcards">
                  <span className="notes-links-label">被 ⭐ 为卡片 ({flashcards.length})</span>
                  {flashcards.map((f) => (
                    <div key={f.cardId} className={`notes-flashcard-item ${f.valid ? '' : 'invalid'}`}>
                      <small>偏移 {f.segOffset}</small>
                      {!f.valid && <span className="warn"> ⚠ 源已变</span>}
                    </div>
                  ))}
                </div>
              )}
```

- [ ] **Step 6: 段选区视觉标记 — 推迟到 v1.4**

v1.3 范围声明：本任务不实施段选区浅色底色（避免与 textarea selection API 跨浏览器差异纠缠）。Step 7 跑通后直接进 Step 8。v1.4 再加：
- 段选区存本地 Map<noteId, SegmentRange[]>
- 编辑器渲染时按 range 套 `background: var(--accent-soft)`
- ⭐ 创建后立即 push range

- [ ] **Step 7: 编译 + 跑全部前端测试**

Run: `npm run build && npm test -- --run`
Expected: 编译通过,既有测试不受影响。

- [ ] **Step 8: 手动验收**

dev 模式下：
1. 在速记里输入一段文字
2. 选中其中几行
3. 点 ⭐ 按钮 → toast 或反链面板出现新条目
4. 进知识卡模块页 → 该卡应在复习列表
5. 4 档打分 → 下一张

- [ ] **Step 9: Commit**

```bash
git add src/features/notes/NotesPage.tsx
git commit -m "feat(notes): 编辑器 ⭐ 加为闪卡 + 反链面板扩展"
```

---

## 阶段 5:联动与速览 + 备份 v11

### Task 14: 备份 v11 升版

**Files:**
- Modify: `src-tauri/src/backup.rs:7` (`VERSION = 10` → `VERSION = 11`)
- Modify: `src-tauri/src/backup.rs:9-37` (export 末尾追加 3 个 query_*)
- Modify: `src-tauri/src/backup.rs:40-110` (import 中追加 3 个 match doc.get)
- Modify: `src-tauri/src/db.rs` (在 import 末尾追加 reading_items / flashcard_cards / flashcard_reviews 三表的清空+插入逻辑)
- Modify: `src-tauri/src/backup.rs:341+` (新增 1 个备份导入重建阅读 FTS 的测试 + 1 个 v10→v11 兼容测试)

**Interfaces:**
- Consumes: `ReadingItem` / `FlashcardCard` / `FlashcardReview` (Task 3);`query_all_reading` / `query_all_flashcards_by_note` / `query_flashcard_review`(Task 4)
- Produces: 备份 v11 导出/导入完整覆盖两个新模块;v10 备份导入时新表视为空

- [ ] **Step 1: 改 `backup.rs` 顶部 VERSION**

将 `pub const VERSION: i64 = 10;` 替换为 `pub const VERSION: i64 = 11;`。

- [ ] **Step 2: 在 export 函数末尾追加 3 个 query**

```rust
    let reading_items = query_all_reading(conn)?;
    let flashcard_cards = query_all_flashcards(conn)?;
    let flashcard_reviews = query_all_flashcard_reviews(conn)?;
```

并把 `let doc = json!({...});` 块末尾追加 3 个键:

```rust
        "readingItems": reading_items,
        "flashcardCards": flashcard_cards,
        "flashcardReviews": flashcard_reviews,
```

- [ ] **Step 3: 在 `db.rs` 添加 `query_all_flashcards` / `query_all_flashcard_reviews`**

在 Task 4 末尾追加:

```rust
pub fn query_all_flashcards(conn: &Connection) -> rusqlite::Result<Vec<crate::models::FlashcardCard>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {} FROM flashcard_cards ORDER BY created_at",
        crate::models::FLASHCARD_CARD_COLS
    ))?;
    let rows = stmt.query_map([], crate::models::row_to_flashcard)?;
    rows.collect()
}

pub fn query_all_flashcard_reviews(conn: &Connection) -> rusqlite::Result<Vec<crate::models::FlashcardReview>> {
    let mut stmt = conn.prepare(crate::models::FLASHCARD_REVIEW_COLS)?;
    // 简单全部读（review 行与 card 1:1，体量极小）
    let sql = format!("SELECT {} FROM flashcard_reviews", crate::models::FLASHCARD_REVIEW_COLS);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], crate::models::row_to_flashcard_review)?;
    rows.collect()
}
```

- [ ] **Step 4: 在 import 函数追加 3 个 match + 3 个 insert 事务**

紧跟现有 `let workout_logs ...` 块后:

```rust
    let reading_items: Vec<ReadingItem> = match doc.get("readingItems") {
        Some(v) => serde_json::from_value(v.clone()).context("readingItems 字段格式错误")?,
        None => Vec::new(),
    };
    let flashcard_cards: Vec<FlashcardCard> = match doc.get("flashcardCards") {
        Some(v) => serde_json::from_value(v.clone()).context("flashcardCards 字段格式错误")?,
        None => Vec::new(),
    };
    let flashcard_reviews: Vec<FlashcardReview> = match doc.get("flashcardReviews") {
        Some(v) => serde_json::from_value(v.clone()).context("flashcardReviews 字段格式错误")?,
        None => Vec::new(),
    };
```

在 import 函数末尾、commit 之前（找 `tx.commit()` 那段）追加 3 个循环插表:

```rust
    for r in &reading_items {
        tx.execute(crate::models::READING_INSERT, params![
            r.id, r.kind, r.title, r.creator, r.source_url, r.status,
            r.rating, r.progress_total, r.progress_current,
            r.cover_path, r.started_at, r.finished_at,
            r.created_at, r.updated_at, r.notes_id,
        ]).context("导入 reading_items 失败")?;
    }
    for c in &flashcard_cards {
        tx.execute(crate::models::FLASHCARD_CARD_INSERT, params![
            c.id, c.note_id, c.seg_offset, c.seg_length, c.seg_hash, c.created_at,
        ]).context("导入 flashcard_cards 失败")?;
    }
    for r in &flashcard_reviews {
        tx.execute(crate::models::FLASHCARD_REVIEW_UPSERT, params![
            r.card_id, r.next_due, r.interval_days, r.factor, r.reps, r.lapses,
        ]).context("导入 flashcard_reviews 失败")?;
    }
```

- [ ] **Step 5: 备份导入后重建 reading FTS 索引**

在 import 事务 commit 之后（找 `tx.commit()` 行,在它之后）追加:

```rust
    // 重建 reading_items FTS 索引（与 v9 起 notes/links 触发器一致）。
    conn.execute_batch(
        "DELETE FROM search_index WHERE kind='reading';
         INSERT INTO search_index(kind, ref_id, title, body)
         SELECT 'reading', id, cjk_space(title),
                COALESCE(cjk_space(creator),'') || ' ' || COALESCE(cjk_space(source_url),'')
         FROM reading_items;"
    ).context("重建 reading FTS 索引失败")?;
```

- [ ] **Step 6: 写 v11 备份 roundtrip + v10 兼容测试**

在 `backup.rs` 末尾 `mod tests` 中追加:

```rust
    #[test]
    fn export_import_preserves_v11_reading_and_flashcards() {
        // 构造 v11 库（含 reading + flashcard + review），导出导入。
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::register_cjk_space(&c).unwrap();
        c.execute_batch(crate::db::SCHEMA_V9).unwrap();
        c.execute_batch(crate::db::SEARCH_TRIGGERS).unwrap();
        c.execute_batch(crate::db::MIGRATE_V10).unwrap();
        crate::db::migrate(&c).unwrap();
        // 注入：1 条 reading,1 张 flashcard,1 行 review
        c.execute(crate::models::READING_INSERT, params![
            "r1","book","预算","张三",None,"wishlist",None,None,None,None,None,None,
            "2026-09-11T00:00:00","2026-09-11T00:00:00",None
        ]).unwrap();
        c.execute("INSERT INTO notes (id,title,content,pinned,created_at,updated_at) VALUES ('n1','t','预算管理',0,'2026-09-11','2026-09-11')", []).unwrap();
        c.execute(crate::models::FLASHCARD_CARD_INSERT, params![
            "c1","n1",0,4,crate::flashcard::segment_hash("预算"),"2026-09-11T00:00:00"
        ]).unwrap();
        c.execute(crate::models::FLASHCARD_REVIEW_UPSERT, params![
            "c1","2026-09-12T00:00:00Z",1.0_f64,2.0_f64,0_i64,0_i64
        ]).unwrap();

        let dir = tempdir();
        let path = dir.join("v11.json");
        super::export(&c, &path).unwrap();
        let mut c2 = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::register_cjk_space(&c2).unwrap();
        c2.execute_batch(crate::db::SCHEMA_V9).unwrap();
        c2.execute_batch(crate::db::SEARCH_TRIGGERS).unwrap();
        c2.execute_batch(crate::db::MIGRATE_V10).unwrap();
        crate::db::migrate(&c2).unwrap();
        let n = super::import(&mut c2, &path).unwrap();
        assert!(n >= 1);
        let reading = crate::db::query_all_reading(&c2).unwrap();
        assert_eq!(reading.len(), 1);
        assert_eq!(reading[0].title, "预算");
        let cards = crate::db::query_all_flashcards_by_note(&c2, "n1").unwrap();
        assert_eq!(cards.len(), 1);
    }

    #[test]
    fn import_v10_backup_without_v11_tables_is_accepted() {
        // 构造 v10 备份（无 readingItems/flashcardCards/flashcardReviews 字段），导入 v11 库应成功。
        let c = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::register_cjk_space(&c).unwrap();
        c.execute_batch(crate::db::SCHEMA_V9).unwrap();
        c.execute_batch(crate::db::SEARCH_TRIGGERS).unwrap();
        c.execute_batch(crate::db::MIGRATE_V10).unwrap();
        crate::db::migrate(&c).unwrap();
        c.execute("INSERT INTO notes (id,title,content,pinned,created_at,updated_at) VALUES ('n1','t','c',0,'2026-09-11','2026-09-11')", []).unwrap();
        let dir = tempdir();
        let path = dir.join("v10.json");
        std::fs::write(&path, r#"{"version": 10, "exportedAt": "2026-09-11", "tasks": [], "notes": [], "links": [], "boards": [], "habits": [], "habitLogs": [], "timeEntries": [], "ledgerEntries": [], "weightLogs": [], "workoutLogs": [], "settings": []}"#).unwrap();
        let mut c2 = rusqlite::Connection::open_in_memory().unwrap();
        crate::db::register_cjk_space(&c2).unwrap();
        c2.execute_batch(crate::db::SCHEMA_V9).unwrap();
        c2.execute_batch(crate::db::SEARCH_TRIGGERS).unwrap();
        c2.execute_batch(crate::db::MIGRATE_V10).unwrap();
        crate::db::migrate(&c2).unwrap();
        super::import(&mut c2, &path).unwrap();
        let reading = crate::db::query_all_reading(&c2).unwrap();
        assert_eq!(reading.len(), 0);
    }
```

> 若 `tempdir` 未在测试中导入,需在文件顶部 `#[cfg(test)] mod tests` 内追加 `use tempfile::tempdir;`（检查现有 import,若 `backup.rs` 已用,直接复用）。

- [ ] **Step 7: 跑 backup 测试**

Run: `cd src-tauri && cargo test backup`
Expected: 全部 PASS,含新增 2 个。

- [ ] **Step 8: 全量 cargo test + npm test**

Run: `cd src-tauri && cargo test && cd .. && npm test -- --run`
Expected: 全部通过,无回归。

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/backup.rs src-tauri/src/db.rs
git commit -m "feat(backup): v11 备份导出/导入覆盖 reading+flashcards"
```

### Task 15: 速览卡（今日阅读 + 今日复习）

**Files:**
- Modify: `src/features/overview/overview.ts` (追加 `todayReading(items)`、`todayFlashcards(reviews, todayIso)`)
- Modify: `src/features/overview/overview.test.ts` (追加对应测试)
- Modify: `src/features/overview/OverviewPage.tsx` (在 cards 数组末尾追加两张卡)

**Interfaces:**
- Consumes: `ReadingItem[]` / `FlashcardReview[]` (Task 7)
- Produces: 两个纯函数 + 速览卡组件

- [ ] **Step 1: 在 `overview.ts` 末尾追加两个纯函数**

```ts
export interface TodayReading {
  inProgress: number;
  latest: ReadingItem | null;
}

export function todayReading(items: ReadingItem[]): TodayReading {
  const inProg = items.filter((i) => i.status === 'in_progress');
  return {
    inProgress: inProg.length,
    latest: inProg.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null,
  };
}

export function todayFlashcards(due: { nextDue: string }[], today: string): number {
  return due.filter((r) => r.nextDue <= today).length;
}
```

> 注意: 在文件顶部 `import` 块追加 `import type { ReadingItem } from '../../types';`(若还没有)。

- [ ] **Step 2: 在 `overview.test.ts` 追加测试**

```ts
import { todayReading, todayFlashcards } from './overview';
// 测试略,与前面 reading.test 风格一致。
```

至少 2 个 case:
- `todayReading` 空数组返回 `{inProgress:0, latest:null}`
- `todayFlashcards` 全部 nextDue 早于 today 计数正确

- [ ] **Step 3: 跑测试**

Run: `npm test -- --run overview.test`
Expected: 全部 PASS。

- [ ] **Step 4: 在 `OverviewPage.tsx` 顶部追加 import**

```ts
import { todayReading, todayFlashcards } from './overview';
import type { ReadingItem, FlashcardReview } from '../../types';
```

(若与现有合并;`import type { Task, Habit, TimeEntry, Note, HabitLog, LedgerEntry, WeightLog, WorkoutLog } from '../../types';` 那行加 `ReadingItem, FlashcardReview`)

- [ ] **Step 5: 在 cards 计算处追加数据加载**

在现有 `useEffect` / `invoke` 块（一般叫 `loadAll`）追加两行:

```ts
      const reading = await invoke<ReadingItem[]>('reading_list');
      const reviews = await invoke<{ nextDue: string }[]>('flashcard_list_due', { today: new Date().toISOString() });
      // 速览只关心计数
```

(实际实现里阅读清单数据可能已经在 settings 加载时获取;若没有则在 cards 计算前加载。)

- [ ] **Step 6: 在 cards 数组里追加两张卡**

找到 `const cards = [...]` 块,在末尾追加:

```ts
{
  title: '今日阅读',
  value: `${todayReading(reading).inProgress} 在读`,
  sub: todayReading(reading).latest?.title ?? '无在读项',
  to: '/reading',
},
{
  title: '今日复习',
  value: `${todayFlashcards(reviews, new Date().toISOString())} 张待复习`,
  to: '/flashcards',
},
```

- [ ] **Step 7: 编译**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 8: Commit**

```bash
git add src/features/overview/overview.ts src/features/overview/overview.test.ts src/features/overview/OverviewPage.tsx
git commit -m "feat(overview): 速览新增'今日阅读'+'今日复习'卡"
```

### Task 16: 设置页"关于"卡版本号 + 文案更新

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx` (找出"关于"卡文案)

**Interfaces:**
- Consumes: 无
- Produces: 文案更新到 v1.3

- [ ] **Step 1: 在设置页"关于"卡中找到版本号文字**

找 `v1.2.0` 关键字(可能为 `<h3>MyDesk v1.2.0</h3>` 或类似),替换为 `v1.3.0`。

- [ ] **Step 2: 在"关于"卡描述中追加两行新功能简介**

```tsx
        <p>本期新增：阅读清单（六类全分类）、知识卡（速记 ⭐ 进复习池）。</p>
```

- [ ] **Step 3: 编译**

Run: `npm run build`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsPage.tsx
git commit -m "chore: 设置页关于卡更新到 v1.3.0"
```

### Task 17: CHANGELOG 增补 v1.3 条目

**Files:**
- Modify: `CHANGELOG.md` (在文件顶部 v1.2 块前追加 v1.3 块)

**Interfaces:**
- Consumes: 已实施内容
- Produces: 符合 Keep a Changelog 格式的 v1.3 块

- [ ] **Step 1: 在 `CHANGELOG.md` 顶部 v1.2.0 标题前插入**

```markdown
## [1.3.0] - 2026-09-11

阅读版：阅读清单与知识卡两个新模块，"读→记→摘→复习"完整闭环。

### 新增

- **📚 阅读清单**（新模块）：6 类全覆盖（书/影/剧/播客/文章/其他），5 态（想看/在读/已完/暂停/弃坑），极简卡 + 进度条 + 0-5 评分；本地手动传封面；JSON/CSV 批量导入；同名检查 + 一键创建《书名》配套速记；勾选完成弹评分小窗。
- **🧠 知识卡**（新模块）：速记里 ⭐ 选中段 → 复习池；四档简化 SM-2 调度（一页一卡，4 档打分）；段位置 + sha256 标识，源已变时标 valid=false 不删卡；复习页右侧"查看原速记"跳回；反链面板"被 ⭐ 为卡片"分区。
- **数据库 v11**：新增 reading_items / flashcard_cards / flashcard_reviews 三表与 FTS 触发器；自动迁移，老库升级保数据。
- **备份 v11**：覆盖两个新模块；v10 旧备份仍可导入（新表视为空）。
- **今日速览**：新增"今日阅读""今日复习"两张卡。
- **新 Tauri 命令**（16 个）：reading_list/get/create/update/delete/import_json/import_csv/open_notes、flashcard_create/list_by_note/list_due/review/delete/source_status。
- **新纯函数**：reading 过滤/搜索/分组/进度/CSV 解析、flashcard SM-2 镜像、overview 今日阅读/今日复习。

### 变更

- 模块注册：侧边栏新增两个独立模块（📚 / 🧠），设置页独立开关。
- 速记编辑器 ⭐ 按钮：选中段时启用，未选中禁用。

### 风险与边界

- 闪卡源已变时仍可复习（标 valid=false，提示查看原速记），不删除。
- 速记删除级联删其下所有卡（CASCADE）。
- 段位置漂移时自动夹回末尾，仍可复习但标 invalid。
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG 增补 v1.3 阅读清单 + 知识卡"
```

---

## 阶段 6:集成验收与发布

### Task 18: E2E 验收清单（人工 / 半自动）

**Files:**
- 无文件改动，纯验收

**Interfaces:**
- Consumes: 全部 Tauri 命令与前端组件
- Produces: 验收清单完成证明（commit 标记）

- [ ] **Step 1: 全量测试双绿**

```bash
npm run test
cd src-tauri && cargo test && cd ..
```
Expected: 全部 PASS。

- [ ] **Step 2: 全量构建双绿**

```bash
npm run build
cd src-tauri && cargo build --release && cd ..
```
Expected: 编译通过。

- [ ] **Step 3: dev 模式跑通验收清单**

```bash
npm run tauri dev
```

按 spec 验收清单逐项走查（见 `docs/superpowers/specs/2026-09-11-v13-reading-flashcards-design.md:第 12 节`），并把"通过"打勾填到本任务下作为子项 commit 信息参考。

- [ ] **Step 4: 验证老库迁移（手动）**

1. 备份当前 v1.2 库（设置页导出 JSON）
2. 删除 `%APPDATA%/personal-workstation/app.db`
3. 把备份的 v1.2 库文件还原为 app.db
4. `npm run tauri dev` 启动 → 顶部速览 / 设置 / 速记 / 任务 / 习惯 / 记账 / 体重 / 锻炼 / 心流 / 日历 / 链接 全部能打开,无新模块数据（预期）
5. 关闭后再次打开 → 关闭再开 OK（PRAGMA user_version 应为 11）
6. 检查 SQLite：`sqlite3 app.db "PRAGMA user_version"` 应返回 11

- [ ] **Step 5: Commit 验收标记（README 顶部加 v1.3 横幅）**

修改 `README.md` 顶部版本 badge:
- `![版本](https://img.shields.io/badge/version-1.2.0-blue)` → `![版本](https://img.shields.io/badge/version-1.3.0-blue)`

并在"功能"列表插入 v1.3 新增条目简介（2-3 行）。

```bash
git add README.md
git commit -m "docs: README 升版 v1.3.0 + 新功能简介"
```

### Task 19: 打包与可安装产物

**Files:**
- 无文件改动,产生二进制

**Interfaces:**
- Consumes: 全部已 commit 代码
- Produces: `MyDesk-v1.3.0-setup.exe` 在仓库根

- [ ] **Step 1: 运行 dist 脚本**

```bash
npm run dist
```
Expected: 产出 `MyDesk-v1.3.0-setup.exe` 在仓库根。

- [ ] **Step 2: 启动安装包,做冷启动验收**

1. 双击安装到临时目录
2. 启动 → 进主界面
3. 创建阅读清单项 + 配套速记 + ⭐ 一段 → 复习 → 4 档打分 → 退出
4. 导出 JSON 备份 → 卸载 → 重装 → 导入 → 一切复原

- [ ] **Step 3: 提交 exe 到 git（如仓库约定保留二进制则 git add;否则 gitignore 已配置）**

按 `git status` 决定:

```bash
# 若二进制需要入库：
git add MyDesk-v1.3.0-setup.exe
git commit -m "chore: 发布 v1.3.0 安装包"
```

> 参考 v1.0/v1.1/v1.2 的提交,前面 .exe 都入了仓库。如本仓库也入,照办;否则跳过。

### Task 20: mimosa 安全扫描 + git tag

**Files:**
- 无文件改动

- [ ] **Step 1: 运行 mimosa 深度扫描**

```text
用 mcp__plugin_mimosa_mimosa__security_scan 工具,depth=normal,project=D:\Desktop\Personal Workstation。
```

Expected: 0 findings。

- [ ] **Step 2: 打 tag**

```bash
git tag -a v1.3.0 -m "v1.3.0 阅读清单 + 知识卡"
git push origin v1.3.0
```

(若远端未 push 权限,只本地 tag 即可)

- [ ] **Step 3: 更新 MEMORY（如有跨项目可复用经验）**

按 `C:\Users\Administrator\.zcode\cli\memories\projects\personal-workstation-2526fd50855ed4ab\memory/MEMORY.md` 现有结构追加:
- "v1.3 落地两个新模块耗时 X 个任务、Y 个 commit"（仅当与未来排期相关）

---

## 自查

### Spec 覆盖检查

| Spec 节 | 覆盖任务 |
|---|---|
| 0 背景 | 全部（路线图与设计文档） |
| 1 设计基线 | Task 7, 8, 9, 12, 13 |
| 2 数据模型 | Task 1, 2, 3, 4 |
| 2.2 FTS5 同步 | Task 1, 2 |
| 2.3 备份 v11 | Task 14 |
| 3 类型与 Tauri 命令 | Task 3, 5, 6, 7 |
| 4 模块注册 | Task 7 |
| 5 阅读清单模块页 | Task 9 |
| 5.1 布局 | Task 9 |
| 5.2 极简卡 | Task 9 |
| 5.3 详情抽屉 | Task 9 |
| 5.4 完成动作 | Task 9 |
| 5.5 新建/编辑 | Task 9 |
| 5.6 配套速记 | Task 5 (open_notes), Task 9 (UI) |
| 5.7 批量导入 | Task 8 (CSV 解析), Task 10 (设置页入口) |
| 6 知识卡模块页 | Task 12 |
| 6.1 主页面 | Task 12 |
| 6.2 复习模式 | Task 12 |
| 6.3 复习纯函数 | Task 6 (后端), Task 11 (前端) |
| 6.4 源已变 | Task 6 (resolve_segment) |
| 6.5 速记 ⭐ 集成 | Task 13 |
| 6.6 反链面板扩展 | Task 13 |
| 7 速览卡 | Task 15 |
| 8 设置页 | Task 10, 16 |
| 9 错误处理 | Task 6 (resolve_segment 越界), Task 1 (CASCADE), Task 9 (UI 兜底) |
| 10 测试策略 | 全部 TDD 任务 |
| 11 实施拆分 | 5 阶段映射到 Task 1-17 |
| 12 验收 | Task 18 |
| 13 风险与对策 | Task 6 (resolve_segment), Task 14 (备份), Task 9 (同名检查) |

### 命名一致性

- `nextSchedule` 在 `flashcard.rs` (后端)、`flashcards.ts` (前端) 行为一致
- `segmentHash` / `sha256Hex` 命名不同(后端小写,前端驼峰) — 接受,因为语言惯例
- `resolveSegment` (后端) ↔ 前端无对应函数(前端段位置由 Tauri 校验,无须镜像)
- `query_all_reading` / `query_all_flashcards` / `query_all_flashcard_reviews` 在 `db.rs` 中命名一致
- `ReadingItem` / `FlashcardCard` / `FlashcardReview` 在 `models.rs` 与 `types.ts` 字段对齐
- `flashcard_list_due` 返回 `Vec<FlashcardDue>` 复合结构(flatten card + note_title + seg_text + valid),前端用 `FlashcardDue` 类型接

### 已知缺口

1. Task 13 的段选区浅色底色标记推迟到 v1.4 — 已在代码中留 TODO
2. 封面选择后端持久化路径(`%APPDATA%/personal-workstation/covers/`) — Task 9 直接存绝对路径,不复制到 AppData。**v1.3 接受此简化,留 v1.4 增强**。
3. Task 12 的 `optimistic` 变量实际未用(直接调后端) — 后续如需乐观 UI 再启用
