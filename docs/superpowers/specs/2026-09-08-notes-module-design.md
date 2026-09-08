# 笔记模块设计（MyDesk v0.2）

日期：2026-09-08
状态：已批准（基于 2026-09-07 Personal Workstation 总体设计第 11 节预留的扩展方向）

## 1. 目标与边界

在现有任务看板、日历之外新增第三个模块「笔记」：纯文本快速记录，双栏布局，支持搜索与置顶，停止输入 1 秒后自动保存。与任务/日历数据完全独立，不做联动。

**明确不做（YAGNI）**：Markdown 渲染、标签分类、笔记↔任务联动、富文本、笔记单独备份开关、分页加载。

## 2. 数据模型

### 2.1 SQLite 迁移 v3→v4

`user_version` 从 3 升到 4。新表：

```sql
CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0,   -- 0/1，映射 Rust Option<i64> 或 bool
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- `SCHEMA_V4`：新库（user_version=0 且无 tasks/notes 表）直接建 v4 形态（tasks + notes + settings）。
- `upgrade_to_v4()`：v3 库仅补建 notes 表（tasks 不动）。
- 迁移路径：0→4（新库）、1→4、2→4、3→4 全部收敛到 4；幂等可重复执行。
- 存量 v0.1.0 用户升级后 tasks/settings 数据零变动。

### 2.2 Rust 模型（`models.rs`）

```rust
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
```

辅助常量 `NOTE_COLS` / `NOTE_INSERT`、行映射 `note_from_row`、查询 `query_all_notes`（`ORDER BY pinned DESC, updated_at DESC`，与前端展示顺序一致，前端不做二次排序）。

### 2.3 Commands（`commands.rs`，沿用 `with_conn` 模式）

| command | 参数 | 返回 | 说明 |
|---|---|---|---|
| `note_list` | — | `Vec<Note>` | 全量，已排序 |
| `note_create` | `input: NoteInput` | `Note` | uuid v4，服务端生成时间戳 |
| `note_update` | `note: Note` | `Note` | 服务端刷新 updated_at；pinned 由前端传入 |
| `note_delete` | `id: String` | `()` | 物理删除 |

在 `lib.rs` 的 `invoke_handler` 中注册以上 4 个。

### 2.4 备份（`backup.rs`）v3→v4

- `VERSION` 升到 4；导出 JSON 增加 `"notes": [...]` 字段。
- 导入接受 `version <= 4`；`notes` 字段缺失（v1–v3 备份）视为空数组——旧备份导入后笔记清空（整库替换语义，与 tasks/settings 一致）。
- 导入事务中 `DELETE FROM notes` 后重插；错误零写入语义不变。
- 同步修正现有测试中的 version 断言（`doc["version"] == 3` → 4），并新增：含笔记 roundtrip、v3 备份导入兼容两条用例。

## 3. 前端

### 3.1 类型与 API

`types.ts` 增加 `Note`（id/title/content/pinned/createdAt/updatedAt）、`NoteInput`（title/content?）。
`lib/api.ts` 增加 `noteList/noteCreate/noteUpdate/noteDelete`。

### 3.2 纯函数（`features/notes/notes.ts`，Vitest 覆盖）

- `searchNotes(notes, keyword)`：标题+内容不区分大小写包含匹配；keyword 为空返回全部。
- `splitPinned(notes)`：按 `pinned` 拆为 `[pinned, unpinned]` 两组（依赖后端已排序的输入，保持组内顺序）。
- `noteExcerpt(content)`：取首个非空行，截断到 40 字符加省略号。

### 3.3 Store（`stores/notes.ts`，Zustand，仿 tasks.ts）

状态：`notes: Note[]`、`selectedId: string | null`、`saving: 'idle' | 'pending' | 'saving'`。

动作：
- `load()`：全量拉取；若 `selectedId` 失效则选中列表第一条。
- `select(id)`：先 flush 待保存内容再切换，避免竞态丢字。
- `create()`：创建空笔记并选中，返回新 id。
- `edit(id, patch)`：本地即时更新（UI 响应），1 秒防抖后调 `noteUpdate`；期间 `saving='pending'`，请求中 `'saving'`，完成 `'idle'`。连续编辑重置计时器。
- `togglePin(id)`：立即持久化（不走防抖）。
- `remove(id)`：物理删除；删除当前选中的笔记后自动选中列表第一条，无笔记则 `selectedId=null`。
- 组件卸载时 flush。

### 3.4 页面（`features/notes/NotesPage.tsx`，双栏布局）

```
┌──────────────┬────────────────────────────┐
│ [搜索…] ＋新建 │ 标题输入          [📌] [🗑] │
│ ── 置顶 ──    ├────────────────────────────┤
│  笔记A        │                            │
│  笔记B        │      内容 textarea          │
│  笔记C        │                            │
│              │                  已保存 10:32│
└──────────────┴────────────────────────────┘
```

- 左栏：搜索框、`＋新建`按钮、列表按「置顶组 / 其余」分组显示；每项显示标题（空则「无标题」）、摘要、更新时间短格式（`format.ts` 补 `timeShort`）；置顶项带图钉标记。
- 右栏：标题 `<input>`、内容 `<textarea>`（占满剩余高度）、置顶切换与删除按钮（删除经 `confirm` 二次确认，同设置页导入备份模式）、右下角保存状态（保存中…/已保存）。
- 空态：无任何笔记时右侧显示引导文案与「新建第一篇笔记」按钮。
- 样式：`index.css` 新增 `.notes-layout` 等类，复用现有 CSS 变量与 `panel/btn/input` 类，浅/深主题均正常。

### 3.5 模块注册（`modules/registry.ts`）

```ts
{ id: 'notes', name: '笔记', icon: '✎', description: '纯文本快速记录', defaultEnabled: true, route: '/notes', component: NotesPage }
```

设置页模块开关、侧边栏自动生效；默认启用，升级后直接可见。

## 4. 错误处理

- 沿用 store 模式：invoke 失败经 `useUiStore.toast(..., 'error')` 提示，编辑保存失败时保留本地内容并回退 `saving='idle'`，允许用户重试（再次输入即重新触发保存）。
- 删除确认取消则不做任何事。
- 搜索、分组等纯 UI 逻辑不涉及错误路径。

## 5. 测试

- Rust：迁移（新库 v4 含 notes、v3→v4 数据保留、幂等）、models roundtrip、备份 roundtrip（含笔记）、v3 备份导入兼容、备份版本校验仍拒绝超版。
- Vitest：`notes.ts` 三纯函数、（若时间允许）store 自动保存行为；沿用现有纯函数测试风格。
- 手工冒烟：新建→输入停顿自动保存→搜索→置顶→删除→重启数据保留→设置页开关模块→浅/深主题。

## 6. 文档

- README 功能清单加「笔记」；修正 React 18→19 描述漂移。
