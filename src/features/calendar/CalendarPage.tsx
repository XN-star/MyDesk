import { useState } from 'react';
import MonthGrid from '../../components/MonthGrid';
import { toDateStr } from '../../lib/format';
import { useTaskStore } from '../../stores/tasks';
import { tasksForDate } from './selectors';
import DayPanel from './DayPanel';

const DOT_LIMIT = 6;

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateStr(new Date()));
  const tasks = useTaskStore((s) => s.tasks);

  function shiftMonth(delta: number) {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    setMonth(next);
  }

  function renderDots(ds: string) {
    const dayTasks = tasksForDate(ds, tasks);
    if (dayTasks.length === 0) return null;
    const shown = dayTasks.slice(0, DOT_LIMIT);
    return (
      <div className="cell-dots">
        {shown.map((t) => (
          <span key={t.id} className={`tdot p${t.priority}${t.status === 'done' ? ' done' : ''}`} />
        ))}
        {dayTasks.length > DOT_LIMIT && <span className="cell-more">+{dayTasks.length - DOT_LIMIT}</span>}
      </div>
    );
  }

  return (
    <div className="calendar-page">
      <div className="calendar panel">
        <div className="calendar-head">
          <button className="btn" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <span className="calendar-title">
            {month.getFullYear()} 年 {month.getMonth() + 1} 月
          </span>
          <button className="btn" onClick={() => shiftMonth(1)}>
            ›
          </button>
        </div>
        <MonthGrid month={month} selectedDate={selected} onPick={setSelected} renderDots={renderDots} />
      </div>
      <DayPanel date={selected} />
    </div>
  );
}
