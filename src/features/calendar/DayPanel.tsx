import { useState } from 'react';
import TimeSpinner from '../../components/TimeSpinner';
import { fromDate } from '../../lib/format';
import { useTaskStore } from '../../stores/tasks';
import { tasksForDate } from './selectors';

export default function DayPanel({ date }: { date: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const dayTasks = tasksForDate(date, tasks);

  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');

  async function add() {
    if (!title.trim()) return;
    await useTaskStore.getState().create({
      title: title.trim(),
      dueAt: `${date}T${time}:00`,
    });
    setTitle('');
  }

  async function toggleTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const done = t.status !== 'done';
    await useTaskStore.getState().update({
      ...t,
      status: done ? 'done' : 'todo',
      doneAt: done ? fromDate(new Date()) : null,
    });
  }

  return (
    <div className="day-panel panel">
      <div className="day-panel-title">{date}</div>
      <section>
        <h4>当日条目</h4>
        {dayTasks.map((t) => (
          <div key={t.id} className="day-row">
            <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTask(t.id)} />
            <span className={`day-title${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
            <span className="day-time">{(t.dueAt ?? '').slice(11, 16)}</span>
            <button
              className="btn danger"
              title="删除"
              onClick={() => useTaskStore.getState().remove(t.id)}
            >
              删
            </button>
          </div>
        ))}
        {dayTasks.length === 0 && <div className="day-empty">当天暂无条目</div>}
        <div className="day-add">
          <input
            className="input"
            placeholder="标题（如：开周会）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <div className="day-add-times">
            <span className="day-add-label" title="用于到点提醒与排序">
              时刻
            </span>
            <TimeSpinner value={time} onChange={setTime} />
            <button className="btn primary" onClick={add}>
              添加
            </button>
          </div>
          <div className="day-hint">到该时刻会弹出系统提醒，并按此刻在日历排序</div>
        </div>
      </section>
    </div>
  );
}
