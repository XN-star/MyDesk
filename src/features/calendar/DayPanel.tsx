import { useState } from 'react';
import TimeSpinner from '../../components/TimeSpinner';
import { REMIND_OPTIONS, remindToNumber } from '../../lib/remind';
import { useNotesStore } from '../../stores/notes';
import { useSettingsStore } from '../../stores/settings';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';
import { findDailyNote } from '../notes/notes';
import { tasksForDate } from './selectors';

export default function DayPanel({ date }: { date: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const dayTasks = tasksForDate(date, tasks);
  const notes = useNotesStore((s) => s.notes);
  const dailyNote = findDailyNote(notes, date);
  const enabledIds = useSettingsStore((s) => s.enabledModules);
  const notesEnabled = enabledIds.includes('notes');

  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [remind, setRemind] = useState('0');

  async function add() {
    if (!title.trim()) return;
    await useTaskStore.getState().create({
      title: title.trim(),
      dueAt: `${date}T${time}:00`,
      remindMinutesBefore: remindToNumber(remind),
    });
    setTitle('');
  }

  async function toggleTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const done = t.status !== 'done';
    if (done) {
      await useTaskStore.getState().complete(t);
    } else {
      await useTaskStore.getState().update({
        ...t,
        status: 'todo',
        doneAt: null,
      });
    }
  }

  async function openDailyNote() {
    await useNotesStore.getState().openOrCreateDaily(date);
    useUiStore.getState().setPage('notes');
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
          <div className="day-add-times">
            <span className="day-add-label">提醒</span>
            <select
              className="input day-remind-select"
              value={remind}
              onChange={(e) => setRemind(e.target.value)}
            >
              {REMIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="day-hint">到该时刻会弹出系统提醒，并按此刻在日历排序</div>
        </div>
      </section>
      <section>
        {notesEnabled && (
          <button className="btn day-note-btn" onClick={() => void openDailyNote()}>
            📝 {dailyNote ? '打开当日速记' : '创建当日速记'}
          </button>
        )}
      </section>
    </div>
  );
}
