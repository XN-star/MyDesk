import { useEffect, useState } from 'react';
import { dueLabel, timeShort, toDateStr } from '../../lib/format';
import { api } from '../../lib/api';
import type { TimeEntry } from '../../types';
import { useHabitsStore } from '../../stores/habits';
import { useLinksStore } from '../../stores/links';
import { useNotesStore } from '../../stores/notes';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';
import { kindIcon } from '../links/links';
import { frequentLinks, recentNotes, taskStats, todayFocus, todayHabits, upcomingTasks, weekReport } from './overview';
import { useTimerStore } from '../../stores/timer';

export default function OverviewPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.load);
  const notes = useNotesStore((s) => s.notes);
  const loadNotes = useNotesStore((s) => s.load);
  const links = useLinksStore((s) => s.links);
  const loadLinks = useLinksStore((s) => s.load);
  const openLink = useLinksStore((s) => s.open);
  const habits = useHabitsStore((s) => s.habits);
  const habitLogs = useHabitsStore((s) => s.logs);
  const loadHabits = useHabitsStore((s) => s.load);
  const running = useTimerStore((s) => s.running);
  const loadTimer = useTimerStore((s) => s.load);
  const setPage = useUiStore((s) => s.setPage);

  useEffect(() => {
    void loadTasks();
    void loadNotes();
    void loadLinks();
    void loadHabits();
    void loadTimer();
  }, [loadTasks, loadNotes, loadLinks, loadHabits, loadTimer]);

  // 30s 拉一次今日计时条目；进行中条目的分钟数由 timer store 心跳带动重算
  useEffect(() => {
    const t = setInterval(() => void loadTimer(), 30_000);
    return () => clearInterval(t);
  }, [loadTimer]);
  const [dayEntries, setDayEntries] = useState<TimeEntry[]>([]);
  useEffect(() => {
    const dayStart = `${toDateStr(new Date())}T00:00:00`;
    const dayEnd = `${toDateStr(new Date())}T23:59:59`;
    api.timeEntries(dayStart, dayEnd).then(setDayEntries).catch(() => {});
  }, [running]);

  const stats = taskStats(tasks, new Date());
  const upcoming = upcomingTasks(tasks, new Date());
  const notes5 = recentNotes(notes);
  const links6 = frequentLinks(links);
  const week = weekReport(tasks, new Date());
  const today = toDateStr(new Date());
  const habitsToday = todayHabits(habits, habitLogs, today);
  const focus = todayFocus(dayEntries, tasks, new Date());
  const delta = (cur: number, prev: number) => {
    const d = cur - prev;
    if (d === 0) return <span className="ov-delta">持平</span>;
    return (
      <span className={`ov-delta${d > 0 ? ' up' : ' down'}`}>
        {d > 0 ? `+${d}` : d}
      </span>
    );
  };

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
        <button className="panel overview-card" onClick={() => setPage('calendar')}>
          <h3>📈 本周回顾</h3>
          <div className="overview-stats">
            <span>
              <b>{week.done}</b> 完成 {delta(week.done, week.donePrev)}
            </span>
            <span>
              <b>{week.created}</b> 新建 {delta(week.created, week.createdPrev)}
            </span>
            <span>
              <b>{week.overdue}</b> 逾期 {delta(week.overdue, week.overduePrev)}
            </span>
          </div>
        </button>
        <button className="panel overview-card" onClick={() => setPage('habits')}>
          <h3>◉ 今日习惯</h3>
          {habits.length === 0 ? (
            <p className="muted">还没有习惯</p>
          ) : (
            <>
              <div className="overview-stats">
                <span>
                  <b>
                    {habitsToday.checked}/{habitsToday.total}
                  </b>{' '}
                  已打卡
                </span>
              </div>
              {habitsToday.pending.length > 0 && (
                <ul className="overview-list">
                  {habitsToday.pending.slice(0, 3).map((h) => (
                    <li key={h.id}>
                      <span className="ov-title">{h.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </button>
        <button className="panel overview-card" onClick={() => setPage('focus')}>
          <h3>⏱ 今日专注</h3>
          {focus.totalMin === 0 ? (
            <p className="muted">今天还没有专注记录</p>
          ) : (
            <>
              <div className="overview-stats">
                <span>
                  <b>{focus.totalMin}</b> 分钟
                </span>
              </div>
              <ul className="overview-list">
                {focus.byTask.map((x) => (
                  <li key={x.taskId}>
                    <span className="ov-title">{x.title}</span>
                    <span className="ov-time">{x.minutes} 分钟</span>
                  </li>
                ))}
              </ul>
            </>
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
