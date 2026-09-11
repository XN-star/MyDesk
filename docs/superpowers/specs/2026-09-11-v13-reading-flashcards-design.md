# MyDesk v1.3 设计：阅读清单 + 知识卡

日期：2026-09-11
范围：新增两个模块 📚 阅读清单（`reading`）和 🧠 知识卡（`flashcards`），数据库迁移 v11，备份格式 v11。

## 0. 背景与定位

- 候选清单（`2026-09-11-module-roadmap-design.md`）中，阅读清单与知识卡是"输入 → 沉淀 → 复习"完整闭环的两个环；本设计将两者一并落地。
- **阅读清单**（6 类全覆盖）解决"读了很多但没记录"；**知识卡**（整段即卡）解决"看了很多但记不住"。
- 两者通过速记耦合：清单项可挂"配套速记"作为详注；速记里 ⭐ 一段可进复习池。
- 沿用项目一贯原则：本地、单机、100% 数据本地；TDD 友好的纯函数优先；不引入账号 / 同步 / AI / 联网拉取。

## 1. 设计基线（脑暴拍板）

| 维度 | 决策 |
|---|---|
| 阅读清单 · 类型 | 6 类全覆盖（书/影/剧/播客/文章/其他） |
| 阅读清单 · 状态 | 5 态：想看 / 在读 / 已完成 / 暂停 / 弃坑 |
| 阅读清单 · 进度 | `current/total`（页/集），其他类型 NULL |
| 阅读清单 · 评分 | 0–5 整数 |
| 阅读清单 · 封面 | 手动传本地图片，存 AppData 目录 |
| 阅读清单 · 速记联动 | "清单为源，速记为详注"——同名检查 + 一键创建《书名》速记 |
| 阅读清单 · 源链接 | 仅存 URL 字段，不拉取、不预览 |
| 阅读清单 · 列表默认 | "想看"清单 + 三个 tab（想看/在读/已完）+ 全部分页 |
| 阅读清单 · 完成 | 勾选后弹评分小窗（评分+完成日+感想入口） |
| 阅读清单 · 批量 | JSON / CSV 本地导入 |
| 阅读清单 · 统计 | 顶部统计条（6 类总完成/在读/本月/上月） |
| 闪卡 · 形态 | 整段即卡（极简，front=段，back=同段） |
| 闪卡 · 存储 | 只存位置（速记 id + 段偏移/长度/段 sha256） |
| 闪卡 · 段定位 | 手动选区打 ⭐ |
| 闪卡 · 源已变 | 标记"源已变"，复习时显示，点击可跳回原速记 |
| 闪卡 · 算法 | 四档简化 SM-2：1 重来 / 2 困难 / 3 良好 / 4 简单；factor=1.2/1.5/2.0/2.8；忘了重置 |
| 闪卡 · 节奏 | 每天全部到期卡都拉出，无每日上限 |
| 闪卡 · 复习 UI | 一张一页，正面 → 翻面 → 4 档打分 |
| 闪卡 · 入口 | 仅速览卡提示（"今日复习 X 张"），无系统通知、无侧边角点 |
| 闪卡 · 闭环 | 复习页右侧"查看原速记"可跳；原速记反链面板显示"这些段被 ⭐ 为卡片" |
| 报名点 | 侧边栏两个独立模块（📚 阅读 / 🧠 知识卡），设置页独立开关 |
| 同步 | v1.3 一起上，v1.4 视反馈迭代 |
| 备份 | 一次迁移 v11（reading_items + flashcard_cards + flashcard_reviews） |

## 2. 数据模型

### 2.1 迁移 v11

```sql
-- 阅读清单
CREATE TABLE reading_items (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK(kind IN ('book','movie','tv','podcast','article','other')),
  title         TEXT NOT NULL,
  creator       TEXT,                   -- 作者/导演/主播
  source_url    TEXT,                   -- 仅存，不拉取
  status        TEXT NOT NULL CHECK(status IN ('wishlist','in_progress','done','paused','dropped')),
  rating        INTEGER CHECK(rating BETWEEN 0 AND 5),
  progress_total INTEGER,                -- 页/集
  progress_current INTEGER,
  cover_path    TEXT,                   -- 相对 AppData 路径
  started_at    TEXT,
  finished_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  notes_id      TEXT REFERENCES notes(id) ON DELETE SET NULL  -- 配套速记（手动建/同名跳转）
);
CREATE INDEX idx_reading_status ON reading_items(status, updated_at DESC);
CREATE INDEX idx_reading_kind   ON reading_items(kind, status);
CREATE INDEX idx_reading_notes  ON reading_items(notes_id);

-- 闪卡（仅存位置）
CREATE TABLE flashcard_cards (
  id            TEXT PRIMARY KEY,
  note_id       TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  seg_offset    INTEGER NOT NULL,
  seg_length    INTEGER NOT NULL,
  seg_hash      TEXT NOT NULL,         -- 段文本 sha256
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_flashcard_note ON flashcard_cards(note_id);

-- 闪卡调度（SM-2 简化）
CREATE TABLE flashcard_reviews (
  card_id       TEXT PRIMARY KEY REFERENCES flashcard_cards(id) ON DELETE CASCADE,
  next_due      TEXT NOT NULL,         -- ISO
  interval_days REAL NOT NULL DEFAULT 1,
  factor        REAL NOT NULL DEFAULT 2.0,
  reps          INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_flashcard_due ON flashcard_reviews(next_due);
```

### 2.2 FTS5 同步

- `search_fts` 增加虚拟列 `reading_items` → `reading_items_search(rowid, title, creator, source_url)`，触发器同步 `INSERT/UPDATE/DELETE`。
- 闪卡不进 FTS（卡的文本来自速记，速记本身已索引）。

### 2.3 备份 v11

`backup.rs` 在 `Backup { schema_version, tables: ... }` 中追加：
- `reading_items`、`flashcard_cards`、`flashcard_reviews` 三表行集。
- 导入兼容 v10 及更早：无新表视为空（不抛错）。导出 `schema_version: 11`。

## 3. 类型与 Tauri 命令

### 3.1 前端类型（`src/types.ts` 追加）

```ts
export type ReadingKind = 'book'|'movie'|'tv'|'podcast'|'article'|'other';
export type ReadingStatus = 'wishlist'|'in_progress'|'done'|'paused'|'dropped';
export interface ReadingItem {
  id: string;
  kind: ReadingKind;
  title: string;
  creator?: string;
  sourceUrl?: string;
  status: ReadingStatus;
  rating?: number;            // 0..5
  progressTotal?: number;
  progressCurrent?: number;
  coverPath?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
  notesId?: string;
}

export type FlashcardGrade = 1|2|3|4;   // 重来/困难/良好/简单
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
```

### 3.2 Tauri 命令（追加 `src-tauri/src/commands.rs`）

```
reading_list(filter?: {kind?, status?}) -> ReadingItem[]
reading_get(id) -> ReadingItem
reading_create(input) -> ReadingItem
reading_update(id, patch) -> ReadingItem
reading_delete(id) -> ()
reading_import_json(rows) -> count
reading_import_csv(text) -> count
reading_export_json() -> string
reading_upload_cover(id) -> path
reading_open_notes(id) -> noteId  -- 若已挂则返回 notes_id；否则按书名查找/创建《书名》并回填

flashcard_create(noteId, segOffset, segLength, segText) -> FlashcardCard
flashcard_list_by_note(noteId) -> FlashcardCard[]
flashcard_list_due(todayISO) -> Array<{card, noteTitle, segText}>
flashcard_review(cardId, grade: 1|2|3|4) -> FlashcardReview   -- 应用 SM-2 更新 nextDue/factor
flashcard_delete(cardId) -> ()
flashcard_source_status(noteId) -> Array<{cardId, segOffset, segLength, segHash, currentHash, valid: bool}>
```

## 4. 模块注册

```ts
// src/modules/meta.ts 追加
{ id: 'reading',    name: '阅读清单', icon: '📚', description: '书/影/剧/播客/文章/其他', defaultEnabled: true,  color: '#0ea5a0' },
{ id: 'flashcards', name: '知识卡',   icon: '🧠', description: '速记里 ⭐ 进复习池',         defaultEnabled: true,  color: '#8b5cf6' },
```

`src/modules/registry.ts` 各注册一行，沿用 v1.2 的导入导出模式。

## 5. 阅读清单模块页

### 5.1 布局

```
┌──────────────────────────────────────────────┐
│ [顶部统计条]                                  │
│  想看 12 · 在读 4 · 已完 87 · 本月完 6 · 上月 8 │
├──────────────────────────────────────────────┤
│ [搜索] [类型筛选▾] [排序：最近更新▾]  [+ 新建] │
├──────────────────────────────────────────────┤
│ [tab] 想看  在读  已完  暂停  弃坑  全部        │
├──────────────────────────────────────────────┤
│ [网格卡 3 列]                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐         │
│  │[封面] │  │[色块]  │  │[封面] │           │
│  │书名 1 │  │书名 2 │  │书名 3 │           │
│  │作者   │  │作者   │  │作者   │           │
│  │[进度] │  │[进度] │  │[进度] │           │
│  │★★★★☆│  │       │  │★★★☆☆ │          │
│  └────────┘  └────────┘  └────────┘         │
└──────────────────────────────────────────────┘
```

### 5.2 极简卡（无封面用类型色块：书=青、影=玫、剧=紫、播客=橙、文章=绿、其他=灰）

- 显示：色块/封面 + 标题 + 作者 + 类型 chip + 进度条 + 评分（0-5 实心星）
- 状态="在读" 显示进度条 + "第 X / Y 页/集"
- 状态="已完" 显示完成日 + 评分实心星
- 状态="想看" 显示"入坑 X 天"（createdAt 距今）
- 右下"打开配套速记"按钮（无 notes_id 时显示"+配套速记"）

### 5.3 详情抽屉

- 上半：封面、标题、作者、类型、状态、源 URL
- 中部：进度滑块（0~total 整数，0 时隐藏；其他类型隐藏）+ 开始日 / 完成日
- 下部：评分（点击实心星）、创建/更新/配套速记跳转
- 底部"删除"按钮（二次确认）

### 5.4 完成动作

勾选状态改为"已完"时弹小窗：
- 评分（默认 0，可跳过）
- 完成日（默认今天）
- 感想（提示"打开配套速记写？"按钮 → 跳速记）

### 5.5 新建/编辑

- 抽屉内表单
- 类型 select（6 项）；标题必填；作者/源 URL 可选
- 封面：本地图选择（走 Tauri dialog plugin），存 `%APPDATA%/personal-workstation/covers/<id>.<ext>`
- 保存前 TDD 校验纯函数

### 5.6 配套速记（同名检查 + 一键创建）

- 按钮：阅读清单详情右"打开配套速记"
- 流程：调 `reading_open_notes(id)` → 后端查 `notes` 表里 `title = 《书名》` 的 → 找到则回填 `notes_id` 并返回；没有则创建一条空速记（`title=《书名》`、内容留空、`pinned=0`、`created_at=now`），回填 `notes_id` 并返回
- 跳转后激活"灵感速记"模块并选中该速记
- 速记里 `[[书名]]` 不再特殊解析（按既有双向链接规则走，有同名速记则链接成功）

### 5.7 批量导入

- 设置页"数据"区加"导入阅读清单"按钮
- 支持 JSON（本项目原生 schema）和 CSV（列：`kind,title,creator,status,rating,progress_total,progress_current,source_url,started_at,finished_at`）
- 解析纯函数 TDD 覆盖
- 预览 → 确认 → 批量 `reading_create`

## 6. 知识卡模块页

### 6.1 主页面（空态 vs 待复习 vs 已完成今日）

- **空态**："还没有卡片。在速记里选中一段按 ⭐ 试试。"
- **待复习**：列表展示 `next_due <= 今天` 的卡（按 next_due 升序，limit 50），按"速记"分组，可点击进入"复习模式"
- **今日已复习**：`flashcard_reviews` 里 `reps > 0 && next_due > 今天` 数量
- 顶部统计条：今日到期 / 今日已复习 / 总卡数 / 平均 factor

### 6.2 复习模式（一页一卡）

```
┌──────────────────────────────────────┐
│  [进度：3 / 12]      [× 退出]         │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  │     卡正面（段落文本）         │    │
│  │                              │    │
│  │            [翻面]             │    │
│  └──────────────────────────────┘    │
│  [来自：《书名》| 段起始] [查看原速记]   │
└──────────────────────────────────────┘
```

翻面后：
```
┌──────────────────────────────────────┐
│  [进度：3 / 12]      [× 退出]         │
│  ┌──────────────────────────────┐    │
│  │  背面（同段，作为"答案"）      │    │
│  └──────────────────────────────┘    │
│  [重来]  [困难]  [良好]  [简单]       │
└──────────────────────────────────────┘
```

### 6.3 复习纯函数（`flashcards.ts`）

```ts
// grade: 1 重来 | 2 困难 | 3 良好 | 4 简单
export function nextSchedule(review, grade, now): FlashcardReview;
```

SM-2 简化版：
- `grade === 1`（重来）：`lapses += 1`；`reps = 0`；`interval = 1`（天）；`factor` 不变
- `grade === 2`（困难）：`interval = max(prevInterval * 1.2, 1.05)`；`factor = max(prevFactor - 0.15, 1.3)`
- `grade === 3`（良好）：`interval = max(prevInterval * prevFactor, 1.5)`；`factor` 不变
- `grade === 4`（简单）：`interval = prevInterval * 2.0`；`factor = min(prevFactor + 0.1, 2.8)`
- `next_due = now + interval 天`

TDD 必须覆盖：边界 case（初次/忘了/连胜）、factor 上下限、lapses 重置、interval 浮点容差。

### 6.4 源已变处理

复习页加载卡时后端比对 `flashcard_cards.seg_hash` 与当前 `note.content.substring(offset, offset+length)` 的 sha256：
- 一致：正常显示
- 不一致：卡标记 `valid=false`，复习页显示 ⚠ 提示"源已变"，但仍可复习；右上"查看原速记"按钮强制显示

### 6.5 速记 ⭐ 集成

`src/features/notes/NotesPage.tsx` 编辑器工具栏加 ⭐ 按钮（仅当选区非空时启用）：
- 拿到 `noteId`、`selStart`、`selEnd`、`selText`
- 调 `flashcard_create`，后端写入 `flashcard_cards`（含 `seg_hash` = sha256(selText)）和 `flashcard_reviews`（初始 `next_due=今天, interval=1, factor=2.0, reps=0, lapses=0`）
- 前端 toast"已加为卡片"
- 段选区加一个浅色底色（`background: var(--accent-soft)`）作为视觉标记

### 6.6 反链面板扩展

`src/features/notes/` 的"反链面板"（现有"引用了它"）下方加新分区"被 ⭐ 为卡片"：
- 列出来自该速记的 `flashcard_cards`，每条显示段起始位置 + 段预览（前后 20 字）
- 点击跳转"知识卡"模块页对应卡

## 7. 速览卡（今日速览）

新增两张：
- **今日阅读**：`reading_items` 状态 in_progress 总数 + 最近一个 in_progress 项（点击进阅读清单）
- **今日复习**：`flashcard_reviews` `next_due <= 今天` 数量（点击进知识卡）
- 位置：与"今日任务""今日习惯"同级别

## 8. 设置页

- 主题/外观不动
- 模块开关：📚 阅读、🧠 知识卡 各自独立开关（与现有模块一致）
- 数据区：新增"导入阅读清单"按钮（JSON/CSV）
- 关于卡片文案更新到 v1.3

## 9. 错误处理与边界

- 阅读清单配套速记创建失败：toast 报错，不修改 `notes_id`
- 速记删除：级联删除其下所有卡（`ON DELETE CASCADE`）；复习页下次进入自然少
- 速记段被改且 hash 变：卡标 `valid=false`，不删除
- 段被改且原位置越界（如速记变短）：后端 `flashcard_list_due` 时偏移校正到 `min(offset, content.length)`，段长度截到末尾，标 `valid=false`
- CSV 导入：解析失败行单独报告，不影响其他行
- 封面路径失效（用户删了本地图）：UI 显示占位色块，不报错

## 10. 测试策略

- `reading.test.ts`：`searchReading`、`sortReading`、`groupByStatus`、`progressPercent`、`csvParse`、`csvStringify` 纯函数 TDD
- `flashcards.test.ts`：`nextSchedule`（SM-2 简化版）、`computeHash`、`resolveSegment`（含越界校正）、`isCardDue` 纯函数 TDD
- 阅读清单页：组件级 vitest + Testing Library
- 速记 ⭐ 按钮：mock Tauri 命令验证

## 11. 实施拆分

- 阶段 1（基础）：数据库迁移 v11 + 类型 + Tauri 命令
- 阶段 2（阅读清单）：模块页 + 抽屉 + 导入
- 阶段 3（闪卡核心）：模块页 + 复习纯函数 + 速记 ⭐ 集成
- 阶段 4（联动与速览）：配套速记 + 反链面板扩展 + 速览卡
- 阶段 5（打磨）：备份 v11 升级 + 设置页 + E2E 验证

## 12. 验收

- [ ] 能建 6 类阅读清单项，封面本地图能选
- [ ] "打开配套速记"对同名速记一键跳转；不存在则建《书名》并回填
- [ ] 完成时弹评分小窗，能跳过
- [ ] 顶部统计条数字与 SQL 聚合一致
- [ ] CSV/JSON 导入行级报告
- [ ] 速记里选中段打 ⭐ 落入 `flashcard_cards`
- [ ] 复习页 4 档打分后 `next_due` 正确（覆盖 SM-2 简化版所有分支）
- [ ] 速记被改 hash 不一致时卡标 valid=false 仍可复习
- [ ] 速记删除级联删卡
- [ ] 速览新增"今日阅读""今日复习"两张卡
- [ ] 备份 v11 导出/导入能完整带两个新模块
- [ ] 老库（v10）启动自动迁移 v11 不丢数据

## 13. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 段定位漂移（速记修改） | 复习显示错位 | hash 校验 + 标 valid=false + 提示查看原速记 |
| 闪卡复习页面 4 档打分被错点 | 调度异常 | 4 档分别有不同色（红/橙/绿/青）+ 复习纯函数 TDD |
| CSV 编码（中文/逗号/换行） | 导入报错 | 用 RFC 4180 标准解析（双引号转义），TDD 覆盖 |
| 配套速记重名 | 用户疑惑 | 详情页显示速记标题，确认无歧义后跳；不静默改名 |
| 数据库迁移失败 | 启动失败 | 复用 v10/v9 的 try/catch 模式 + 备份后迁移 |
| 双模块一起上代码量大 | 评审难 | 实施分 5 阶段；每阶段独立可测 |
