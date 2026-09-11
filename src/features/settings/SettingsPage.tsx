import { useEffect, useState } from 'react';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { api } from '../../lib/api';
import type { AccentTheme, ThemeMode } from '../../lib/theme';
import { MODULES } from '../../modules/registry';
import { useSettingsStore } from '../../stores/settings';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

const ACCENT_OPTIONS: Array<{ value: AccentTheme; label: string; color: string }> = [
  { value: 'teal', label: '青碧', color: '#0d9488' },
  { value: 'indigo', label: '靛蓝', color: '#4f46e5' },
  { value: 'coral', label: '珊瑚', color: '#e85d3d' },
  { value: 'slate', label: '黛青', color: '#35707e' },
];

export default function SettingsPage() {
  const { enabledModules, theme, accent, widgetEnabled, setEnabled, setTheme, setAccent, setWidgetEnabled } =
    useSettingsStore();
  const toast = useUiStore((s) => s.toast);
  // 番茄档位（分钟），从 settings 读取，本地编辑后保存
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);

  useEffect(() => {
    api
      .settingsAll()
      .then((all) => {
        setFocusMin(Number(all.pomodoroFocus) || 25);
        setBreakMin(Number(all.pomodoroBreak) || 5);
      })
      .catch(() => {});
  }, []);

  async function savePomodoro() {
    const f = Math.min(120, Math.max(1, Math.round(focusMin) || 25));
    const b = Math.min(60, Math.max(1, Math.round(breakMin) || 5));
    setFocusMin(f);
    setBreakMin(b);
    try {
      await api.pomodoroSet(f, b);
      toast(`番茄档位已保存：专注 ${f} 分钟 / 休息 ${b} 分钟`);
    } catch (e) {
      toast(`保存失败：${e}`, 'error');
    }
  }

  async function exportBackup() {
    const path = await save({
      title: '导出备份',
      defaultPath: 'workstation-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return;
    try {
      await api.backupExport(path);
      toast(`已导出到 ${path}`);
    } catch (e) {
      toast(`导出失败：${e}`, 'error');
    }
  }

  async function importBackup() {
    const ok = await confirm('导入备份将覆盖当前全部数据，继续？', { title: '导入备份' });
    if (!ok) return;
    const path = await open({
      title: '选择备份文件',
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return;
    try {
      const n = await api.backupImport(path);
      await useSettingsStore.getState().load();
      await useTaskStore.getState().load();
      toast(`导入完成，共 ${n} 条`);
    } catch (e) {
      toast(`导入失败：${e}`, 'error');
    }
  }

  return (
    <div className="settings">
      <section className="panel settings-card">
        <h3>模块管理</h3>
        {MODULES.map((m) => (
          <label key={m.id} className="settings-row">
            <span>
              <b>{m.name}</b>
              <small>{m.description}</small>
            </span>
            <input
              type="checkbox"
              checked={enabledModules.includes(m.id)}
              onChange={(e) => void setEnabled(m.id, e.target.checked)}
            />
          </label>
        ))}
      </section>
      <section className="panel settings-card">
        <h3>外观</h3>
        <div className="settings-row">
          <span>主题</span>
          <select
            className="input"
            value={theme}
            onChange={(e) => void setTheme(e.target.value as ThemeMode)}
            style={{ width: 140 }}
          >
            {THEME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <span>主题色</span>
          <span className="accent-picker">
            {ACCENT_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`accent-dot${accent === o.value ? ' active' : ''}`}
                style={{ background: o.color }}
                title={o.label}
                aria-label={o.label}
                onClick={() => void setAccent(o.value)}
              />
            ))}
          </span>
        </div>
      </section>
      <section className="panel settings-card">
        <h3>专注</h3>
        <div className="settings-row">
          <span>
            番茄档位
            <small>专注/休息分钟数，任务计时条 🍅 也会使用此档位</small>
          </span>
          <span className="pomodoro-inputs">
            <input
              className="input"
              type="number"
              min={1}
              max={120}
              value={focusMin}
              onChange={(e) => setFocusMin(Number(e.target.value))}
              style={{ width: 70 }}
              title="专注分钟数"
            />
            /
            <input
              className="input"
              type="number"
              min={1}
              max={60}
              value={breakMin}
              onChange={(e) => setBreakMin(Number(e.target.value))}
              style={{ width: 70 }}
              title="休息分钟数"
            />
            <button className="btn" onClick={() => void savePomodoro()}>
              保存
            </button>
          </span>
        </div>
        <p className="muted">习惯提醒的时刻在每个习惯的编辑弹窗中单独设置。</p>
      </section>
      <section className="panel settings-card">
        <h3>桌面小组件</h3>
        <label className="settings-row">
          <span>
            <b>常驻小组件</b>
            <small>桌面右下角置顶显示今日任务、下一次提醒与最近笔记</small>
          </span>
          <input
            type="checkbox"
            checked={widgetEnabled}
            onChange={(e) => void setWidgetEnabled(e.target.checked)}
          />
        </label>
      </section>
      <section className="panel settings-card">
        <h3>备份</h3>
        <p className="muted">数据保存在本机。导出为 JSON 文件；导入会整库替换当前数据。</p>
        <div className="settings-actions">
          <button className="btn" onClick={exportBackup}>
            导出备份…
          </button>
          <button className="btn" onClick={importBackup}>
            导入备份…
          </button>
        </div>
      </section>
      <section className="panel settings-card">
        <h3>关于</h3>
        <p className="muted about-line">
          MyDesk 个人工作台（PersonalWorkstation） <b>v{__APP_VERSION__}</b>
        </p>
        <p className="muted">本地单机 · 数据 100% 存储在本机 SQLite，无账号无云同步。</p>
      </section>
    </div>
  );
}
