# v0.9「检索版」设计（MyDesk）

日期：2026-09-10
状态：执行中（依据 docs/superpowers/specs/2026-09-09-roadmap-v06-v10.md 第 2 节 v0.9）

## 0. 目标与边界

两大块：**全局搜索**（SQLite FTS5 虚拟表，tasks/notes/links 三表索引，触发器同步）与**笔记 `[[双向链接]]`**（编辑自动补全 + 点击跳转 + 反链面板）。

验收：快速面板一个框搜全部；笔记互链可跳转可反查。

**明确不做（YAGNI）**：搜索高亮片段（snippet 留打磨）、链接的星标/引用计数、反链递归展开、`[[`语法在任务/日历的解析、FTS 中文分词优化（unicode61 对中文按字索引，够用）。

## 1. 数据层（迁移 v8→v9）

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  kind,              -- 'task' | 'note' | 'link'
  ref_id,            -- 对应表主键（unindexed）
  title,
  body,
  tokenize = 'unicode61'
);
```

触发器（增删改三表同步，`deleted` 用旧值删除 FTS 行）：

```sql
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('task', new.id, new.title, new.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'task', old.id, old.title, old.description);
END;
CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO search_index(search_index, kind, ref_id, title, body) VALUES('delete', 'task', old.id, old.title, old.description);
  INSERT INTO search_index(kind, ref_id, title, body) VALUES('task', new.id, new.title, new.description);
END;
-- notes（title+content）与 links（title+target）同理
```

- `SCHEMA_V9`（新库直接 v9，含 FTS + 触发器）、`MIGRATE_V9`（v8 库建 FTS+触发器后全量回填：INSERT INTO ... SELECT）、`upgrade_to_v9()`；`user_version` 收敛 **9**。
- 迁移测试：新库含 FTS 表与触发器、v8 库升级后存量数据可被搜到（回填验证）、幂等。
- FTS 删除采用 special `INSERT INTO search_index(search_index, kind, ...) VALUES('delete', ...)` 语法（unicode61 无外部内容表时的标准做法）。

## 2. global_search command

```rust
#[derive(Serialize)] #[serde(rename_all="camelCase")]
pub struct SearchHit { pub kind: String, pub ref_id: String, pub title: String, pub body: String }
```

- `global_search(db, query) -> Vec<SearchHit>`：
  - 查询串 sanitize：`"` 与 `*` 处理——整体作为短语包裹 `"{q}"*`（前缀匹配，避免用户输入 AND/OR/NOT 等运算符报错）；
  - `SELECT kind, ref_id, title, body FROM search_index WHERE search_index MATCH ?1 LIMIT 12`；
  - kind 顺序稳定（task/note/link），LIMIT 各 12。
- 测试：任务/笔记/入口写入后即命中（触发器验证）、更新后命中新值删除旧值、删除后不再命中、空查询返回空、含引号/连字符不报错。

## 3. 笔记反链 command

`[[标题]]` 数据即正文文本，无新表。

- `related_notes(db, id) -> Vec<Note>`：目标笔记 title=T，找 content 含 `[[T]]` 的其他笔记，ORDER BY updated_at DESC LIMIT 20。
- 匹配用 `content LIKE '%[[' || ?title || ']]%'`（LIKE 简单可靠，不做转义因为标题可能含 % 的场景极罕见——文档标注）。
- 测试：双向引用查询、不含未链接笔记、标题含特殊字符不崩。

## 4. 备份 v9

- VERSION 8→9：导出**不含** FTS（虚拟表非 rowid 表，导出反而麻烦）；导入接受 version≤9，导入完成后执行 `INSERT INTO search_index(...) SELECT ... FROM tasks/notes/links` 三段回填重建索引。
- 测试：roundtrip 后仍可 global_search 命中（验证导入后重建）、version 断言 8→9。

## 5. 前端

### 5.1 快速面板升级（QuickWindow）

- `q` 非空且非入口模式（空格）非 bang（/）时：本地任务搜索（现有）与 `api.globalSearch(q)` 并行；FTS 结果分类展示（任务/笔记/入口 tag），去重（本地任务命中与 FTS task 命中合并）。
- 回车行为：选中笔记 → emit `quick://open` `{type:'note', id}` 跳主窗笔记页；入口 → 直接打开（现有）；任务 → 打开抽屉（现有）。
- App.tsx 的 `quick://open` 监听扩展 `type:'note'`：`useUiStore.setPage('notes')` + `useNotesStore.select(id)`。
- 防抖 200ms 发 FTS 查询；输入法组合中不发。

### 5.2 笔记 [[双向链接]]（NotesPage）

- **自动补全**：textarea 监听输入，光标前最近 `[[` 且其后无 `]]` 时弹出候选浮层（当前笔记列表标题过滤，排除自身），↑↓ 选择、Enter/点击插入 `标题]]`，Esc 关闭。
- **点击跳转**：渲染 content 不改（仍纯文本），在编辑器下方加「链接」区块：解析 `[[...]]` 提取本笔记引用的标题，可点击跳转（`select` 对应笔记，无则提示创建）。
- **反链面板**：`api.relatedNotes(current.id)`，编辑器下方列出「引用了它」的笔记，点击跳转。
- **store**：`useNotesStore` 加 `relatedNotes` 缓存字段？——取简：NotesPage 本地 state 每次 current 变化拉取，不进 store。

## 6. 涉及文件

| 文件 | 变更 |
|---|---|
| src-tauri/src/db.rs | SCHEMA_V9/MIGRATE_V9/upgrade_to_v9 + FTS 触发器 + 测试 |
| src-tauri/src/models.rs | SearchHit + global_search/related_notes 查询 + 测试 |
| src-tauri/src/commands.rs | global_search / related_notes |
| src-tauri/src/backup.rs | VERSION 9 + 导入后重建索引 + 测试 |
| src-tauri/src/lib.rs | 注册 2 command |
| src/types.ts / lib/api.ts | SearchHit + globalSearch/relatedNotes |
| src/features/quick/QuickWindow.tsx | 全局搜索接入 |
| src/App.tsx | quick://open 支持 note |
| src/features/notes/NotesPage.tsx | [[补全 + 链接区块 + 反链面板 |
| src/features/notes/notes.ts (+test) | parseLinks(content) 提取引用标题 |
| src/index.css | 候选浮层/链接区块样式 |
| package.json / tauri.conf.json / Cargo.toml | 0.9.0 |

## 7. 验收

- 快速面板输入「预算」能同时命中含该词的任务、笔记、入口
- 笔记输入 `[[` 弹候选，回车补全；下方链接区块点击互跳
- 被引用的笔记下方显示「引用了它」反链
- 删除笔记/任务后快速面板不再搜到
- 备份导出导入后全局搜索仍可用
- vitest 全绿 + cargo test 全绿 + npm run build 通过
