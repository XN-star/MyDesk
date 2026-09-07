import { useState } from 'react';
import { fromDate } from '../../lib/format';
import { useEventStore } from '../../stores/events';
import { useTaskStore } from '../../stores/tasks';
import { eventsForDate, tasksForDate } from './selectors';

export default function DayPanel({ date }: { date: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);
  const dayTasks = tasksForDate(date, tasks);
  const dayEvents = eventsForDate(date, events);

  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTime, setTaskTime] = useState('');

  async function addEvent() {
    if (!eventTitle.trim()) return;
    await useEventStore.getState().create({
      title: eventTitle.trim(),
      date,
      timeStart: eventStart || null,
      timeEnd: eventEnd || null,
    });
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    const dueAt = taskTime ? `${date}T${taskTime}:00` : `${date}T09:00:00`;
    await useTaskStore.getState().create({ title: taskTitle.trim(), dueAt });
    setTaskTitle('');
    setTaskTime('');
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
        <h4>日程</h4>
        {dayEvents.map((e) => (
          <div key={e.id} className="day-row">
            <span className="day-time">{e.timeStart ?? '全天'}</span>
            <span className="day-title">{e.title}</span>
            <button className="btn danger" onClick={() => useEventStore.getState().remove(e.id)}>
              删
            </button>
          </div>
        ))}
        {dayEvents.length === 0 && <div className="day-empty">暂无日程</div>}
        <div className="day-add">
          <input
            className="input"
            placeholder="日程标题"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEvent()}
          />
          <div className="day-add-times">
            <input
              className="input"
              type="time"
              value={eventStart}
              onChange={(e) => setEventStart(e.target.value)}
            />
            <input
              className="input"
              type="time"
              value={eventEnd}
              onChange={(e) => setEventEnd(e.target.value)}
            />
            <button className="btn primary" onClick={addEvent}>
              添加
            </button>
          </div>
        </div>
      </section>
      <section>
        <h4>到期任务</h4>
        {dayTasks.map((t) => (
          <div key={t.id} className="day-row">
            <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTask(t.id)} />
            <span className={`day-title${t.status === 'done' ? ' done' : ''}`}>{t.title}</span>
            <span className="day-time">{(t.dueAt ?? '').slice(11, 16)}</span>
          </div>
        ))}
        {dayTasks.length === 0 && <div className="day-empty">当天无到期任务</div>}
        <div className="day-add">
          <input
            className="input"
            placeholder="任务标题"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
          />
          <div className="day-add-times">
            <input
              className="input"
              type="time"
              value={taskTime}
              onChange={(e) => setTaskTime(e.target.value)}
            />
            <button className="btn primary" onClick={addTask}>
              添加
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
