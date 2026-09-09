# 个人工作台（Personal Workstation）

Windows 桌面个人工作台：任务看板 + 日历日程 + 笔记 + 快捷入口，模块化架构，数据全本地。

## 功能

- **任务看板**：待办/进行中/已完成三列，拖拽换状态、列内排序，优先级与截止时间，过期标红。
- **日历**：月历圆点标记（任务=优先级色），当日详情面板就地增改日程与任务。
- **笔记**：纯文本双栏编辑，关键字搜索，置顶，停止输入 1 秒自动保存。
- **快捷入口**：网址/文件/命令一键启动（系统默认程序打开），网格卡片拖拽排序，关键字过滤。
- **快速面板**：全局 `Alt+Space` 呼出；搜索任务/日程；直接输入文字回车即建任务，支持「明天 15:00」「周五」「14:30」「3点半」等日期短语。
- **到期提醒**：任务到期弹 Windows 系统通知（应用后台运行也会触发；同一任务只提醒一次）。
- **模块化**：设置页可开关模块；新增模块 = `src/features/` 新目录 + `src/modules/registry.ts` 注册一行。
- **数据与备份**：SQLite 本地存储（`%APPDATA%/personal-workstation/app.db`），设置页一键导出/导入 JSON 备份（导入校验版本，失败不写库）。
- **主题**：跟随系统 / 浅色 / 深色，设置页切换。

## 开发

```bash
npm install
npm run tauri dev    # 开发模式
npm run tauri build  # 产出安装包（src-tauri/target/release/bundle）
npx vitest run       # 前端测试
cd src-tauri && cargo test  # 后端测试
```

## 技术栈

Tauri 2 · React 19 · TypeScript · Zustand · dnd-kit · date-fns · solarlunar · rusqlite · Vitest

设计文档：`docs/superpowers/specs/2026-09-07-personal-workstation-design.md`
实现计划：`docs/superpowers/plans/2026-09-07-personal-workstation-mvp.md`
笔记模块设计：`docs/superpowers/specs/2026-09-08-notes-module-design.md`

## 已知说明

- 到期提醒为 30 秒轮询（到期 1 分钟窗口内触发），重启后不补发错过的旧任务提醒。
- 系统通知若被 Windows 关闭，任务仍会在看板中标红显示。
- MVP 单看板；数据层已预留 `board_id` 多看板字段。
