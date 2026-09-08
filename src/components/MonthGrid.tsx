import { useMemo } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { toDateStr } from '../lib/format';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export default function MonthGrid({
  month,
  selectedDate,
  onPick,
  renderDots,
}: {
  month: Date;
  selectedDate: string;
  onPick: (date: string) => void;
  renderDots?: (date: string) => React.ReactNode;
}) {
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );

  return (
    <div className="month-grid">
      {WEEK_LABELS.map((w) => (
        <div key={w} className="calendar-week">
          {w}
        </div>
      ))}
      {days.map((d) => {
        const ds = toDateStr(d);
        const cls = [
          'calendar-cell',
          isSameMonth(d, month) ? '' : 'dim',
          ds === selectedDate ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={ds} className={cls} onClick={() => onPick(ds)}>
            <div className={`cell-num${isSameDay(d, new Date()) ? ' today' : ''}`}>{d.getDate()}</div>
            {renderDots?.(ds)}
          </div>
        );
      })}
    </div>
  );
}
