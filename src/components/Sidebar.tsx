import { enabledModules } from '../modules/registry';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';

export default function Sidebar() {
  const enabled = enabledModules(useSettingsStore((s) => s.enabledModules));
  const { activePage, setPage } = useUiStore();

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="brand-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <rect className="brand-cell c1" x="3" y="3" width="8" height="8" rx="2.6" />
            <rect className="brand-cell c2" x="13" y="3" width="8" height="8" rx="2.6" />
            <rect className="brand-cell c3" x="3" y="13" width="8" height="8" rx="2.6" />
            <circle className="brand-cell c4" cx="17" cy="17" r="4" />
          </svg>
        </span>
        <span className="brand-name">MyDesk</span>
      </div>
      {enabled.map((m) => (
        <button
          key={m.id}
          className={`side-item${activePage === m.id ? ' active' : ''}`}
          title={m.name}
          onClick={() => setPage(m.id)}
        >
          <span className="side-icon" style={m.color ? { color: m.color } : undefined}>
            {m.icon}
          </span>
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
