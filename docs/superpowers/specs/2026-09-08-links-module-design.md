# 快捷入口模块设计（MyDesk v0.3）

日期：2026-09-08
状态：已批准（基于 2026-09-07 总体设计第 11 节预留的「快捷入口」扩展方向）

## 1. 目标与边界

新增第四个模块「快捷入口」：常用网址、本地文件/文件夹、命令的启动器。网格卡片布局，关键字过滤，弹窗新增/编辑，拖拽排序，点击条目用系统默认程序打开。默认启用。

**明确不做（YAGNI）**：分组/文件夹、内置 WebView 打开、使用频次统计、图标自动抓取、导入导出书签、全局快捷键直达某条目。

## 2. 数据模型

### 2.1 SQLite 迁移 v4→v5

`user_version` 收敛到 **5**。新表：

```sql
CREATE TABLE links (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'url',   -- 'url' | 'path' | 'command'
  target     TEXT NOT NULL,                 -- 网址 / 路径 / 命令行
  sort_order REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- `SCHEMA_V5`（新库直接建 v5 形态：tasks + notes + links + settings）、`MIGRATE_V4_TO_V5`（仅补建 links）、`upgrade_to_v5()`；路径 0/1/2/3/4 全部收敛到 5，幂等。
- 排序沿用 tasks 的 sort_order 中点算法（新条目 `MAX(sort_order)+100`）。

### 2.2 Rust 模型（`models.rs`）

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub title: String,
    pub kind: String,      // "url" | "path" | "command"
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
    pub kind: String,      // 默认 "url"
    pub target: String,
}
```

`LINK_COLS` / `LINK_INSERT` / `link_from_row` / `query_all_links`（`ORDER BY sort_order`）。

### 2.3 Commands（`commands.rs`，沿用 `with_conn`）

| command | 参数 | 返回 | 说明 |
|---|---|---|---|
| `link_list` | — | `Vec<Link>` | 全量，按 sort_order |
| `link_create` | `input: LinkInput` | `Link` | uuid + 服务端时间戳 + sort_order 追加到末尾 |
| `link_update` | `link: Link` | `Link` | 服务端刷新 updated_at |
| `link_delete` | `id: String` | `()` | 物理删除 |
| `link_move` | `id: String, sortOrder: f64` | `()` | 拖拽排序落库（前端算好中点） |
| `link_run` | `id: String` | `()` | 仅 command 类型：Rust 侧 `cmd /C` spawn 执行 |

`lib.rs` 注册以上 6 个。

### 2.4 备份 v5（`backup.rs`）

- `VERSION = 5`；导出增加 `"links"` 字段；导入接受 `version <= 5`，`links` 缺失视为空（整库替换语义）；事务中 `DELETE FROM links` 后重插；返回值计入 links 数量。
- 同步修正既有测试的 version 断言（4→5），新增含 links 的 roundtrip、v4 备份（无 links 字段）导入兼容两条用例。

## 3. 前端

### 3.1 类型与 API

`types.ts` 增加 `LinkKind = 'url' | 'path' | 'command'` 与 `Link`、`LinkInput`。
`lib/api.ts` 增加 `linkList/linkCreate/linkUpdate/linkDelete/linkMove`。

### 3.2 纯函数（`features/links/links.ts`，Vitest 覆盖）

- `searchLinks(links, keyword)`：标题+目标不区分大小写包含匹配，空关键字返回全部。
- `applyLinkMove(links, id, targetIndex)`：复用 tasks 的中点算法思路，返回重排后的新数组与被移动条目的新 sort_order（供 `link_move` 落库）。
- `kindIcon(kind)`：'url'→'🌐'、'path'→'📁'、'command'→'⚡'。
- `normalizeTarget(kind, raw)`：url 类自动补 `https://` 前缀（已有协议头则不动）；其余 trim。
- `validateTarget(kind, raw)`：url 必须以 `http://`/`https://` 开头（normalize 后）；path/command 非空即可。返回 `string | null`（null=合法，否则为错误提示文案）。

### 3.3 Store（`stores/links.ts`，Zustand，仿 notes.ts）

状态：`links: Link[]`。
动作：`load()`、`create(input)`、`update(link)`、`remove(id)`、`move(id, targetIndex)`（本地 applyLinkMove 乐观更新 + `linkMove` 落库，失败回滚并 toast）、`open(link)`（按 kind 调 `openUrl`/`openPath`/命令执行，见 3.4；失败 toast）。

### 3.4 打开方式（系统默认程序）

- `kind === 'url'`：`openUrl(target)`（@tauri-apps/plugin-opener）。
- `kind === 'path'`：`openPath(target)`——文件用默认关联程序，文件夹用资源管理器。
- `kind === 'command'`：前端调 `invoke('link_run', { id })`，由 Rust 侧执行：Windows 下 `std::process::Command::new("cmd").args(["/C", target])`，不等待退出（`spawn()`），执行前 toast「已执行」。风险接受：单机个人应用，命令由用户本人输入；编辑表单对 command 类型展示警示文案「将在本机执行此命令」。

### 3.5 页面（`features/links/LinksPage.tsx`）

```
┌──────────────────────────────────────┐
│ [搜索…]                   ＋新建      │
│                                      │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 🌐  │ │ 📁  │ │ ⚡  │ │ 🌐  │    │
│ │Gmail│ │素材 │ │构建 │ │文档 │    │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
│   （dnd-kit 网格拖拽排序）             │
└──────────────────────────────────────┘
```

- 顶栏：搜索框 + ＋新建按钮。
- 网格：`dnd-kit` 可拖拽卡片（图标=kindIcon，标题，target 单行省略），单击卡片=打开，卡片右上角 ✎ 进入编辑弹窗；拖拽手柄为整卡（与看板一致），排序变化即落库。
- 弹窗（复用 `.overlay.center`/`.dialog` 样式）：标题、类型下拉（网址/文件或文件夹/命令）、目标输入框、保存/取消；command 类型显示警示文案；保存前 `validateTarget` 校验。
- 空态：引导「添加第一个快捷入口」。
- 样式：`index.css` 新增 `.links-page` 等类，复用 CSS 变量与既有类。

### 3.6 模块注册（`modules/registry.ts`）

```ts
{ id: 'links', name: '快捷入口', icon: '⚡', description: '网址/文件/命令快速启动', defaultEnabled: true, route: '/links', component: LinksPage }
```

默认启用：无需额外逻辑——上一轮的 `mergeNewDefaultModules` 机制会在老用户首次启动 v0.3 时自动把 `links` 并入 enabledModules 并写入 `mergedDefaultModules` 打标。registry.test.ts 同步更新模块清单断言。

## 4. 错误处理

- 打开失败（路径不存在、无关联程序）：toast 错误信息，不改数据。
- 保存校验失败：弹窗内联错误提示，不关闭弹窗。
- 拖拽落库失败：回滚本地顺序 + toast。
- 所有 invoke 失败沿用 `useUiStore.toast(..., 'error')`。

## 5. 安全说明

- `command` 类型在本机执行任意命令，属用户自担风险的个人应用场景（数据 100% 本地、单用户）。编辑表单明示警示。
- `url`/`path` 走 tauri-plugin-opener，无 shell 注入面。
- capabilities 已含 `opener:default`（openUrl/openPath 默认权限），无需新增权限。

## 6. 测试

- Rust：迁移（新库 v5 含 links、v4→v5 数据保留、幂等）、models roundtrip 与排序、commands 编译回归、备份 roundtrip（含 links）、v4 备份导入兼容、超版本拒绝。
- Vitest：`links.ts` 五个纯函数、registry 更新；store CRUD/move 乐观更新与回滚。
- 手工冒烟：新建三类条目→点击打开（浏览器/资源管理器/命令生效）→搜索→拖拽排序→重启持久→设置页可开关。

## 7. 文档

- README 功能清单加「快捷入口」一行。
