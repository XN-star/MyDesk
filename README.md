# MyDesk（个人工作台）

Windows 桌面个人工作台：概览 + 任务看板 + 日历日程 + 笔记 + 快捷入口，模块化架构，数据全本地。

![版本](https://img.shields.io/badge/version-1.0.1-blue) ![许可证](https://img.shields.io/badge/license-MIT-green) ![平台](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)

## 下载安装

从 [Releases](../../releases) 页面下载最新版 `MyDesk-v<版本>-setup.exe`，双击安装即可。无需其他运行时依赖。

## 功能

- **概览**：今日任务统计、即将到期、最近笔记、常用入口、本周回顾（完成/新建/逾期与上周环比）、今日习惯、今日专注（工时按任务分布）一屏速览，点击直达对应模块。
- **任务看板**：待办/进行中/已完成三列，拖拽换状态、列内排序，优先级与截止时间，过期标红；支持多看板分组与重复任务（每天/每周/每月，完成后自动生成下一单）。
- **专注计时**：任务卡片 ▶ 或抽屉「开始专注」一键计时，同一时间仅一个计时；托盘 tooltip 显示「正在专注：X (mm:ss)」；番茄钟 25/5、45/10、50/10 档位，到点自动停表并弹通知，休息结束提醒继续。
- **日历**：月历圆点标记（任务=优先级色），当日详情面板就地增改日程与任务，一键打开/创建当日笔记。
- **习惯**：打卡追踪，强度评分移植 Loop Habit Tracker 开源 EWMA 算法，52 周热力图、连续天数统计，可设每日提醒时刻（当日未打卡才提醒）。
- **笔记**：纯文本双栏编辑，置顶，停止输入 1 秒自动保存；`[[` 触发笔记标题自动补全，`[[双向链接]]` 可点击跳转（不存在可一键新建），反链面板显示「引用了它」。
- **全局搜索**：快速面板（`Alt+Space`）一框搜任务/笔记/入口（SQLite FTS5，中文按字匹配），分类展示直达。
- **快捷入口**：网址/文件/命令一键启动（系统默认程序打开），网格卡片拖拽排序，关键字过滤。
- **快速面板**：全局 `Alt+Space` 呼出；搜索任务/日程；直接输入文字回车即建任务，支持「明天 15:00」「周五」「14:30」「3点半」等日期短语，以及「每天 9:00」「每周五 18:00」「每月15号」重复提醒与「#标签」；空格列出前九个入口序号直达，`/关键词` 过滤入口回车即开。
- **到期提醒**：任务到期弹 Windows 系统通知（应用后台运行也会触发；同一任务只提醒一次）。
- **模块化**：设置页可开关模块；新增模块 = `src/features/` 新目录 + `src/modules/meta.ts` + `registry.ts` 注册一行。
- **桌面小组件**：可选开启（设置页），桌面右下角置顶显示今日任务、下一次提醒与最近笔记，点击唤起主窗。
- **数据与备份**：SQLite 本地存储（`%APPDATA%/personal-workstation/app.db`），设置页一键导出/导入 JSON 备份（导入校验版本，失败不写库）。
- **主题**：跟随系统 / 浅色 / 深色，设置页切换。
- **版本**：侧栏底部与设置页「关于」显示当前版本（v1.0.0 起提供）。

## 开发

```bash
npm install
npm run tauri dev    # 开发模式
npm run tauri build  # 产出安装包（src-tauri/target/release/bundle）
npm run test         # 前端测试（vitest）
npm run dist         # 打包并重命名为 MyDesk-v<version>-setup.exe（输出到仓库根目录）
cd src-tauri && cargo test  # 后端测试
```

CI：GitHub Actions 在 Windows 上跑 `vitest → vite build → cargo test`（`.github/workflows/ci.yml`）。

## 技术栈

Tauri 2 · React 19 · TypeScript · Zustand · dnd-kit · date-fns · solarlunar · rusqlite（FTS5） · Vitest

设计文档：`docs/superpowers/specs/` · 变更记录：[CHANGELOG.md](CHANGELOG.md)

## 已知说明

- 到期提醒为 30 秒轮询（到期 1 分钟窗口内触发），重启后不补发错过的旧任务提醒。
- 系统通知若被 Windows 关闭，任务仍会在看板中标红显示。

## 从源码构建

需要 Node.js 18+、Rust 1.75+（MSVC 工具链）、WebView2（Win10/11 一般已内置）。

```bash
git clone https://github.com/XN-star/MyDesk.git
cd MyDesk
npm install
npm run dist   # 产出 MyDesk-v<版本>-setup.exe
```

## 参与

欢迎 Issue 与 PR：报错请附上复现步骤与日志；功能建议先开 Issue 讨论。

## 许可证

[MIT](LICENSE) © 2026 XN-star
