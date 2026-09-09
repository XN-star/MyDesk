# 概览模块（MyDesk v0.4）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「概览」模块：聚合今日任务统计、即将到期、最近笔记、常用入口四张卡片，作为工作台首页，纯前端无后端改动。

**Architecture:** 复用既有四模块的 store 数据（load 后从 state 派生），聚合逻辑全部抽为 `features/overview/overview.ts` 纯函数并 Vitest 覆盖；OverviewPage 挂载时并发刷新并渲染。设计文档：`docs/superpowers/specs/2026-09-09-overview-module-design.md`。

**Tech Stack:** React 19 · TypeScript · Zustand 5 · Vitest 5。无新依赖，无 Rust/数据库改动。

## Global Constraints

- UI 文案全部简体中文。
- 不新增数据表、不改 `user_version`（保持 5）、不改备份格式。
- 复用 `useTaskStore`/`useNotesStore`/`useLinksStore`/`useUiStore` 既有接口，不修改其签名。
- 测试命令：`npx vitest run`；`npx tsc --noEmit`。
- 提交信息中文，`--no-verify`。

---

### Task 1: overview.ts 纯函数（TDD）

**Files:**
- Create: `src/features/overview/overview.ts`
- Test: `src/features/overview/overview.test.ts`

**Interfaces:**
- Consumes: `Task`（`src/types.ts`：status/doneAt/dueAt）、`Note`（title/updatedAt）、`Link`（kind/target/title）。
- Produces:
  - `taskStats(tasks: Task[], now: Date): { todoToday: number; doing: number; doneToday: number; overdue: number }`
  - `upcomingTasks(tasks: Task[], now: Date, days?: number, limit?: number): Task[]`
  - `recentNotes(notes: Note[], limit?: number): Note[]`
  - `frequentLinks(links: Link[], limit?: number): Link[]`

- [ ] **Step 1: 写失败测试**

`src/features/overview/overview.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import type { Link, Note, Task } from '../../types';
import { frequentLinks, recentNotes, taskStats, upcomingTasks } from './overview';

const NOW = new Date('2026-09-09T10:00:00');

function task(p: Partial<Task>): Task {
  return {
    id: 't',
    boardId: 'default',
    title: '任务',
    description: '',
    status: 'todo',
    priority: 1,
    dueAt: null,
    sortOrder: 100,
    doneAt: null,
    remindMinutesBefore: null,
    createdAt: '2026-09-08T10:00:00',
    updatedAt: '2026-09-08T10:00:00',
    ...p,
  };
}

describe('taskStats', () => {
  it('统计今日待办/进行中/今日完成/逾期', () => {
    const stats = taskStats(
      [
        task({ id: '1', dueAt: '2026-09-09T18:00:00' }), // 今日待办
        task({ id: '2', status: 'doing' }), // 进行中
        task({ id: '3', status: 'done', doneAt: '2026-09-09T09:00:00' }), // 今日完成
        task({ id: '4', dueAt: '2026-09-08T10:00:00' }), // 逾期
        task({ id: '5' }), // 无截止待办，不计入 todoToday
        task({ id: '6', dueAt: '2026-09-10T10:00:00' }), // 明天，不计
      ],
      NOW,
    );
    expect(stats).toEqual({ todoToday: 1, doing: 1, doneToday: 1, overdue: 1 });
  });

  it('昨天完成不计入今日完成', () => {
    const stats = taskStats([task({ id: '1', status: 'done', doneAt: '2026-09-08T23:00:00' })], NOW);
    expect(stats.doneToday).toBe(0);
  });
});

describe('upcomingTasks', () => {
  it('取 7 天内未完成任务按到期升序，最多 5 条', () => {
    const list = upcomingTasks(
      [
        task({ id: 'far', dueAt: '2026-09-20T10:00:00' }), // 超窗
        task({ id: 'done', status: 'done', dueAt: '2026-09-10T10:00:00' }), // 已完成
        task({ id: 'b', dueAt: '2026-09-12T10:00:00' }),
        task({ id: 'a', dueAt: '2026-09-10T09:00:00' }),
        task({ id: 'n' }), // 无截止
        task({ id: 'past', dueAt: '2026-09-08T10:00:00' }), // 已过期不算 upcoming
      ],
      NOW,
    );
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('recentNotes', () => {
  it('按输入顺序（后端已倒序）取前 N 条', () => {
    const notes = [
      { id: '1', title: 'A', content: '', pinned: false, createdAt: '', updatedAt: '2026-09-09T09:00:00' },
      { id: '2', title: '', content: '', pinned: false, createdAt: '', updatedAt: '2026-09-08T09:00:00' },
    ] as Note[];
    expect(recentNotes(notes, 1)).toEqual([notes[0]]);
  });
});

describe('frequentLinks', () => {
  it('按输入顺序（后端 sort_order）取前 N 条', () => {
    const links = [
      { id: '1', title: 'G', kind: 'url', target: '', sortOrder: 100, createdAt: '', updatedAt: '' },
      { id: '2', title: 'D', kind: 'path', target: '', sortOrder: 200, createdAt: '', updatedAt: '' },
    ] as Link[];
    expect(frequentLinks(links, 1)).toEqual([links[0]]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/features/overview/overview.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 最小实现**

`src/features/overview/overview.ts`：

```typescript
import type { Link, Note, Task } from '../../types';
import { fromDate, toDateStr } from '../../lib/format';

export interface TaskStats {
  todoToday: number;
  doing: number;
  doneToday: number;
  overdue: number;
}

/** 今日任务统计：今日到期待办、进行中、今日完成、逾期（未完成且截止已过）。 */
export function taskStats(tasks: Task[], now: Date): TaskStats {
  const today = toDateStr(now);
  let todoToday = 0;
  let doing = 0;
  let doneToday = 0;
  let overdue = 0;
  for (const t of tasks) {
    if (t.status === 'doing') doing += 1;
    if (t.status === 'done') {
      if (t.doneAt && toDateStr(new Date(t.doneAt)) === today) doneToday += 1;
      continue;
    }
    if (t.dueAt) {
      if (t.dueAt < fromDate(now)) overdue += 1;
      else if (toDateStr(new Date(t.dueAt)) === today) todoToday += 1;
    }
  }
  return { todoToday, doing, doneToday, overdue };
}

/** 未来 days 天内到期的未完成任务，按到期升序取前 limit 条。 */
export function upcomingTasks(tasks: Task[], now: Date, days = 7, limit = 5): Task[] {
  const from = fromDate(now);
  const to = new Date(now);
  to.setDate(to.getDate() + days);
  const toStr = fromDate(to);
  return tasks
    .filter((t) => t.status !== 'done' && !!t.dueAt && t.dueAt >= from && t.dueAt <= toStr)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1))
    .slice(0, limit);
}

/** 最近笔记：依赖后端已按 updated_at 倒序的输入，取前 limit 条。 */
export function recentNotes(notes: Note[], limit = 5): Note[] {
  return notes.slice(0, limit);
}

/** 常用入口：依赖后端 sort_order 排序的输入，取前 limit 条。 */
export function frequentLinks(links: Link[], limit = 6): Link[] {
  return links.slice(0, limit);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/features/overview/overview.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/overview/
git commit --no-verify -m "feat: 概览聚合纯函数（任务统计/即将到期/最近笔记/常用入口）"
```

---

### Task 2: OverviewPage + registry 注册 + 样式 + README

**Files:**
- Create: `src/features/overview/OverviewPage.tsx`
- Modify: `src/modules/registry.ts`（MODULES 首位插入）
- Modify: `src/modules/registry.test.ts`
- Modify: `src/index.css`（末尾追加）
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 纯函数；`useTaskStore`（tasks/load）、`useNotesStore`（notes/load）、`useLinksStore`（links/load/open）、`useUiStore.setPage`；`dueLabel`/`timeShort`（format.ts）；`kindIcon`（features/links/links.ts）。
- Produces: 概览页组件（无对外接口）。

- [ ] **Step 1: registry 注册与测试更新**

`src/modules/registry.ts`：import `OverviewPage`，MODULES 数组首位插入：

```typescript
  {
    id: 'overview',
    name: '概览',
    icon: '◈',
    description: '今日信息一览',
    defaultEnabled: true,
    route: '/overview',
    component: OverviewPage,
  },
```

`src/modules/registry.test.ts` 第一个用例改为：

```typescript
  it('包含概览、任务看板、日历、笔记、快捷入口五个内置模块', () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual(['calendar', 'links', 'notes', 'overview', 'tasks']);
  });
```

- [ ] **Step 2: 实现 OverviewPage**

`src/features/overview/OverviewPage.tsx`：

```tsx
import { useEffect } from 'react';
import { dueLabel, timeShort } from '../../lib/format';
import { useLinksStore } from '../../stores/links';
import { useNotesStore } from '../../stores/notes';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';
import { kindIcon } from '../links/links';
import { frequentLinks, recentNotes, taskStats, upcomingTasks } from './overview';

export default function OverviewPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.load);
  const notes = useNotesStore((s) => s.notes);
  const loadNotes = useNotesStore((s) => s.load);
  const links = useLinksStore((s) => s.links);
  const loadLinks = useLinksStore((s) => s.load);
  const openLink = useLinksStore((s) => s.open);
  const setPage = useUiStore((s) => s.setPage);

  useEffect(() => {
    void loadTasks();
    void loadNotes();
    void loadLinks();
  }, [loadTasks, loadNotes, loadLinks]);

  const stats = taskStats(tasks, new Date());
  const upcoming = upcomingTasks(tasks, new Date());
  const notes5 = recentNotes(notes);
  const links6 = frequentLinks(links);

  return (
    <div className="overview">
      <div className="overview-grid">
        <button className="panel overview-card" onClick={() => setPage('tasks')}>
          <h3>📋 今日任务</h3>
          <div className="overview-stats">
            <span><b>{stats.todoToday}</b> 今日待办</span>
            <span><b>{stats.doing}</b> 进行中</span>
            <span><b>{stats.doneToday}</b> 今日完成</span>
            <span className={stats.overdue > 0 ? 'overdue-num' : ''}><b>{stats.overdue}</b> 逾期</span>
          </div>
        </button>
        <button className="panel overview-card" onClick={() => setPage('tasks')}>
          <h3>⏰ 即将到期</h3>
          {upcoming.length === 0 ? (
            <p className="muted">7 天内没有到期任务</p>
          ) : (
            <ul className="overview-list">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <span className="ov-title">{t.title}</span>
                  <span className="ov-time">{dueLabel(t.dueAt!, new Date())}</span>
                </li>
              ))}
            </ul>
          )}
        </button>
        <button className="panel overview-card" onClick={() => setPage('notes')}>
          <h3>📝 最近笔记</h3>
          {notes5.length === 0 ? (
            <p className="muted">还没有笔记</p>
          ) : (
            <ul className="overview-list">
              {notes5.map((n) => (
                <li key={n.id}>
                  <span className="ov-title">{n.title || '无标题'}</span>
                  <span className="ov-time">{timeShort(n.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </button>
      </div>
      <div className="panel overview-card overview-links">
        <h3>⚡ 常用入口</h3>
        {links6.length === 0 ? (
          <p className="muted">还没有快捷入口</p>
        ) : (
          <div className="overview-chips">
            {links6.map((l) => (
              <button key={l.id} className="ov-chip" title={l.target} onClick={() => void openLink(l)}>
                {kindIcon(l.kind)} {l.title || l.target}
              </button>
            ))}
          </div>
        )}
        <button className="btn overview-more" onClick={() => setPage('links')}>
          管理入口…
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 追加样式**

`src/index.css` 末尾追加：

```css
/* 概览 */
.overview { display: flex; flex-direction: column; gap: 16px; }
.overview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.overview-card { padding: 16px 18px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 10px; }
.overview-card:hover { border-color: var(--accent); }
.overview-card h3 { margin: 0; font-size: 14px; }
.overview-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; color: var(--muted); }
.overview-stats b { font-size: 20px; margin-right: 6px; color: var(--text); }
.overdue-num b { color: var(--danger); }
.overview-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.overview-list li { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.ov-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-time { color: var(--muted); flex: none; }
.overview-links { cursor: default; }
.overview-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ov-chip {
  background: var(--bg); border: 1px solid var(--border); border-radius: 999px;
  padding: 6px 14px; cursor: pointer; font-size: 13px; max-width: 220px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ov-chip:hover { border-color: var(--accent); }
.overview-more { align-self: flex-start; margin-top: 4px; }
```

- [ ] **Step 4: README**

功能清单最前面插入：

```markdown
- **概览**：今日任务统计、即将到期、最近笔记、常用入口一屏速览，点击直达对应模块。
```

简介行改为「任务看板 + 日历日程 + 笔记 + 快捷入口 + 概览」。

- [ ] **Step 5: 全量验证**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 全部 PASS，零类型错误。

- [ ] **Step 6: 提交**

```bash
git add src/features/overview/ src/modules/registry.ts src/modules/registry.test.ts src/index.css README.md
git commit --no-verify -m "feat: 概览模块（四卡片聚合首页）并注册"
```

---

### Task 3: 冒烟验证

- [ ] **Step 1: dev 启动手工冒烟**

Run: `npm run tauri dev`（或 cargo run + npm run dev）

1. 侧边栏第一项为「◈ 概览」；老用户（有 enabledModules 存量数据）升级后自动出现。
2. 四卡片数据与任务/笔记/入口实际数据一致；逾期数>0 时红色显示。
3. 点击今日任务/即将到期卡 → 跳转看板；点击最近笔记卡 → 跳转笔记；点击 chip → 直接打开目标；「管理入口…」→ 跳转快捷入口。
4. 空态文案正确；浅/深主题正常；设置页可关闭概览模块。

---

## Self-Review 记录

- **Spec 覆盖**：§2.1–2.4 四卡片（T1 纯函数 + T2 页面）、§2 各点击行为（T2 onClick）、§3 进入刷新（T2 useEffect 并发 load）、§4 注册与默认启用（T2 registry，mergeNewDefaultModules 无需改码）、§5 测试（T1）与冒烟（T3）、§6 README（T2）。
- **占位符**：无。
- **类型一致性**：`TaskStats` 字段与 §2.1 四指标一致；`upcomingTasks(tasks, now, days?, limit?)` 默认值与测试调用一致；页面使用的 `dueLabel(dueAt!, now)`/`timeShort`/`kindIcon` 均为既有导出。
