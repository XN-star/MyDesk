import { useMemo, useState } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { toDateStr } from '../../lib/format';
import { useEventStore } from '../../stores/events';
import { useTaskStore } from '../../stores/tasks';
import { eventsForDate, tasksForDate } from './selectors';
import DayPanel from './DayPanel';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => toDateStr(new Date()));
  const tasks = useTaskStore((s) => s.tasks);
  const events = useEventStore((s) => s.events);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  function shiftMonth(delta: number) {
    const next = new Date(month);
    next.setMonth(next.getMonth() + delta);
    setMonth(next);
    useEventStore
      .getState()
      .loadMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
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
        <div className="calendar-grid">
          {WEEK_LABELS.map((w) => (
            <div key={w} className="calendar-week">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const ds = toDateStr(d);
            const dayTasks = tasksForDate(ds, tasks);
            const dayEvents = eventsForDate(ds, events);
            const isToday = isSameDay(d, new Date());
            return (
              <div
                key={ds}
                className={[
                  'calendar-cell',
                  isSameMonth(d, month) ? '' : 'dim',
                  ds === selected ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelected(ds)}
              >
                <div className={`cell-num${isToday ? ' today' : ''}`}>{d.getDate()}</div>
                <div className="cell-dots">
                  {dayTasks.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className={`tdot p${t.priority}${t.status === 'done' ? ' done' : ''}`}
                    />
                  ))}
                  {dayEvents.slice(0, 4).map((e) => (
                    <span key={e.id} className="edot" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <DayPanel date={selected} />
    </div>
  );
}
