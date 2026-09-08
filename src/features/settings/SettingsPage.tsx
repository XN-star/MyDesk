import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { api } from '../../lib/api';
import type { ThemeMode } from '../../lib/theme';
import { MODULES } from '../../modules/registry';
import { useSettingsStore } from '../../stores/settings';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export default function SettingsPage() {
  const { enabledModules, theme, setEnabled, setTheme } = useSettingsStore();
  const toast = useUiStore((s) => s.toast);

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
    </div>
  );
}
