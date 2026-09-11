import { useEffect, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Sidebar from './components/Sidebar';
import TodayBar from './components/TodayBar';
import TimerBar from './components/TimerBar';
import Toasts from './components/Toasts';
import ExitDialog from './components/ExitDialog';
import TaskDrawer from './features/tasks/TaskDrawer';
import SettingsPage from './features/settings/SettingsPage';
import { enabledModules } from './modules/registry';
import { applyTheme, THEME_EVENT } from './lib/theme';
import { useBoardsStore } from './stores/boards';
import { useNotesStore } from './stores/notes';
import { useSettingsStore } from './stores/settings';
import { useTaskStore } from './stores/tasks';
import { useUiStore } from './stores/ui';

export default function App() {
  const activePage = useUiStore((s) => s.activePage);
  const drawer = useUiStore((s) => s.drawer);
  const enabled = enabledModules(useSettingsStore((s) => s.enabledModules));
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const [showExit, setShowExit] = useState(false);

  useEffect(() => {
    useSettingsStore.getState().load().then(() => {
      useTaskStore.getState().load();
    });
    useBoardsStore.getState().load();
  }, []);

  useEffect(() => {
    applyTheme(theme, accent);
    void emit(THEME_EVENT, { theme, accent });
  }, [theme, accent]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => {
      applyTheme('system', accent);
      void emit(THEME_EVENT, { theme: 'system', accent });
    };
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [theme, accent]);

  useEffect(() => {
    const un1 = listen('quick://changed', () => {
      useTaskStore.getState().load();
    });
    const un2 = listen<{ type: 'task' | 'note' | 'event'; id: string }>('quick://open', async (e) => {
      const w = getCurrentWindow();
      await w.show();
      await w.setFocus();
      if (e.payload.type === 'task') useUiStore.getState().openTask(e.payload.id);
      else if (e.payload.type === 'note') {
        useUiStore.getState().setPage('notes');
        await useNotesStore.getState().select(e.payload.id);
      }
    });
    const un3 = listen('app://close-requested', () => {
      setShowExit(true);
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
    };
  }, []);

  const current = enabled.find((m) => m.id === activePage) ?? enabled[0];
  const Page = current?.component;

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <TodayBar />
        <TimerBar />
        <div className="content">
          <div className="page-fade" key={activePage}>
            {activePage === 'settings' ? (
              <SettingsPage />
            ) : Page ? (
              <Page />
            ) : (
              <div className="empty">请先在设置中启用至少一个模块</div>
            )}
          </div>
        </div>
      </div>
      {drawer && <TaskDrawer />}
      {showExit && <ExitDialog onClose={() => setShowExit(false)} />}
      <Toasts />
    </div>
  );
}
