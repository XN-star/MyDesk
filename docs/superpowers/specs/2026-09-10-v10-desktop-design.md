# v1.0「桌面版」设计（MyDesk）

日期：2026-09-10
状态：执行中（依据 docs/superpowers/specs/2026-09-09-roadmap-v06-v10.md 第 2 节 v1.0 + 用户补充：版本标识与打包）

## 0. 目标与边界

四块：**桌面常驻小组件窗口**、**设置页增强**、**工程化补课（CI/CHANGELOG/安装包命名）**、**打磨清单 + 版本标识 + 打包**。

**明确不做（YAGNI）**：小组件点击穿透（会挡住桌面操作反而难用，透明窗 + 拖动即可）、日历周视图（低优先，放弃）、多显示器定位记忆、小组件自定义主题。

## 1. 桌面常驻小组件窗口（默认关）

### 1.1 Rust 侧

- `tauri.conf.json` 增加第三窗口 `widget`：240×420、`visible:false`、`decorations:false`、`alwaysOnTop:true`、`skipTaskbar:true`、`transparent:true`、`resizable:false`、右下角出现（`center:false`；创建后由前端/后端定位到工作区右下）。
- `widget_data` command：一次拉取小组件所需数据 `{ todayTasks: Task[], nextReminder: Task | null, recentNotes: Note[] }`（复用现有查询，纯 SQL/内存聚合，不新表）。
- `widget_show` / `widget_hide` command：显示（定位右下）与隐藏；设置 `widgetEnabled`（settings，默认 'false'）。
- capabilities：`widget` 窗口加入 `default.json` 的 windows 列表（复用 core:default + notification 权限即可；小组件不 emit 事件）。

### 1.2 前端 widget.html + WidgetWindow

- vite 增加 widget 入口；`WidgetWindow.tsx`：
  - 顶部「MyDesk」小标 + 拖动区；
  - 「今日任务」列表（未完成、按 dueAt 升序，最多 5 条，勾选完成）；
  - 「下一次提醒」（标题 + dueLabel）；
  - 「最近笔记」（最多 3 条标题，点击唤起主窗并跳转）；
  - 30s 轮询 `widget_data` 刷新；主窗 `quick://changed`/任务变更事件同样刷新。
  - 点击笔记/任务 → `emit('quick://open', {type,id})`（主窗已有监听）+ 主窗 show。

## 2. 设置页增强

- **专注**：番茄专注/休息分钟数两个 number input（存 settings `pomodoroFocus/pomodoroBreak`，1-120 校验）。
- **习惯提醒**：说明文案（习惯提醒时刻在每个习惯的编辑弹窗里设），不重复做全局开关。
- **桌面小组件**：开关 checkbox → `widgetEnabled` + 即时 `widget_show/widget_hide`。
- **关于**：显示版本号（`__APP_VERSION__` 编译期注入，见第 5 节）与产品名。

## 3. 打磨清单

1. **任务看板页搜索框**：KanbanPage 顶部加关键字输入，`searchTasks(tasks, q)` 纯函数（TDD，标题+描述匹配），看板列过滤显示（不影响拖拽排序数据源）。
2. **笔记字数统计**：NotesPage 状态栏显示「n 字」（去空白计数）。
3. **通知点击唤起主窗口**：Rust 通知改用 `app.notification().builder().on_click(...)`?——tauri-plugin-notification 2.x 的通知点击事件需要 channel；**取简方案**：所有通知统一在前端 emit 已有 `app://close-requested` 同款机制不可行，改为 Rust 侧通知构建时携带 `identifier`，并通过 `tauri_plugin_notification::NotificationExt` 的 builder 无法直接挂点击回调 → 采用社区标准做法：Windows 通知点击默认会聚焦应用?（不会）。**最终方案**：保留现有通知，另在 reminders/timer 通知发出后 5 秒内前端轮询到新数据即可；「点击唤起」通过托盘左键已有实现替代（文档标注 v1.0 放弃项，理由：tauri-plugin-notification 2.x 无同步点击回调 API，自建 win32 通知系统成本不成比例）。
   - 替代落地：通知发出时同时 `emit("app://notify", {title, body})`，主窗若开着则 TimerBar 区域闪现 toast（已有 Toasts 组件）——小改进，保留。
4. **日历周视图**：放弃（低优先）。

## 4. 工程化

- **CI**：`.github/workflows/ci.yml`——windows-latest：`npm ci → npx vitest run → npm run build → cd src-tauri && cargo test`（rustfmt/clippy 暂不阻塞）。
- **CHANGELOG.md**：v0.1→v1.0 全版本记录。
- **安装包自动命名**：`tauri.conf.json` bundle 加 `fileName` 不可用 → 由 CI/打包脚本重命名；本地用 `npm run dist` 脚本（package.json script 调 PowerShell 复制 `PersonalWorkstation_<version>_x64-setup.exe` → `MyDesk-v<version>-setup.exe`）。产物名统一 MyDesk 前缀。
- **README**：补充截图占位说明与 CHANGELOG 链接（截图需运行时截取，README 留占位段落）。

## 5. 软件内版本标识

- vite `define`: `__APP_VERSION__ = JSON.stringify(pkg.version)` 编译期注入。
- 主窗 Sidebar 底部显示 `MyDesk v1.0.0`；设置页「关于」卡片显示版本 + 构建日期。
- 全局类型声明 `src/vite-env.d.ts` 加 `declare const __APP_VERSION__: string`。

## 6. 涉及文件

| 文件 | 变更 |
|---|---|
| src-tauri/tauri.conf.json | widget 窗口配置 |
| src-tauri/src/commands.rs | widget_data/show/hide |
| src-tauri/src/lib.rs | 注册 command + widget 窗口创建 |
| src-tauri/capabilities/default.json | windows 加 widget |
| vite.config.ts | widget 入口 |
| widget.html / src/widget-main.tsx / src/features/widget/WidgetWindow.tsx | 小组件前端 |
| src/lib/api.ts | widgetData 等 |
| src/features/tasks/search.ts (+test) | searchTasks |
| src/features/tasks/KanbanPage.tsx | 搜索框 |
| src/features/notes/NotesPage.tsx | 字数统计 |
| src/features/settings/SettingsPage.tsx | 专注/小组件/关于 |
| src/components/Sidebar.tsx | 版本标识 |
| vite.config.ts / src/vite-env.d.ts | __APP_VERSION__ |
| .github/workflows/ci.yml / CHANGELOG.md | 工程化 |
| package.json | dist 脚本 + 0.10?→1.0.0 |

## 7. 验收

- 设置页开启小组件 → 桌面右下出现置顶半透明小组件（今日任务/下一次提醒/最近笔记），关闭即消失
- 设置页可改番茄档位；主窗侧栏与设置「关于」显示 v1.0.0
- 看板页搜索框过滤任务；笔记状态栏显示字数
- CI 配置就绪；CHANGELOG 完整；`npm run dist` 产出 `MyDesk-v1.0.0-setup.exe`
- vitest 全绿 + cargo test 全绿 + npm run build 通过 + 安装包可静默覆盖安装（手动验证）
