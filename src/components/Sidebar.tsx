import { enabledModules } from '../modules/registry';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';

export default function Sidebar() {
  const enabled = enabledModules(useSettingsStore((s) => s.enabledModules));
  const { activePage, setPage } = useUiStore();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">◆</div>
      {enabled.map((m) => (
        <button
          key={m.id}
          className={`side-item${activePage === m.id ? ' active' : ''}`}
          title={m.name}
          onClick={() => setPage(m.id)}
        >
          <span className="side-icon">{m.icon}</span>
          <span className="side-name">{m.name}</span>
        </button>
      ))}
      <div className="sidebar-spacer" />
      <button
        className={`side-item${activePage === 'settings' ? ' active' : ''}`}
        title="设置"
        onClick={() => setPage('settings')}
      >
        <span className="side-icon">⚙</span>
        <span className="side-name">设置</span>
      </button>
    </nav>
  );
}
