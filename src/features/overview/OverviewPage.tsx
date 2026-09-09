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
            <span>
              <b>{stats.todoToday}</b> 今日待办
            </span>
            <span>
              <b>{stats.doing}</b> 进行中
            </span>
            <span>
              <b>{stats.doneToday}</b> 今日完成
            </span>
            <span className={stats.overdue > 0 ? 'overdue-num' : ''}>
              <b>{stats.overdue}</b> 逾期
            </span>
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
