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
import solarlunar from 'solarlunar';
import { toDateStr } from '../lib/format';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 农历短文案：节气/节日优先，否则「X月Y日」。 */
export function lunarLabel(d: Date): string {
  const r = solarlunar.solar2lunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
  if (!r) return '';
  if (r.termStr) return r.termStr;
  if (r.festivalStr) return r.festivalStr;
  return `${r.monthStr}${r.dayStr}`;
}

export default function MonthGrid({
  month,
  selectedDate,
  onPick,
  renderDots,
  showLunar = false,
}: {
  month: Date;
  selectedDate: string;
  onPick: (date: string) => void;
  renderDots?: (date: string) => React.ReactNode;
  showLunar?: boolean;
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
            <div className="cell-line">
              <span className={`cell-num${isSameDay(d, new Date()) ? ' today' : ''}`}>
                {d.getDate()}
              </span>
              {showLunar && <span className="cell-lunar">{lunarLabel(d)}</span>}
            </div>
            {renderDots?.(ds)}
          </div>
        );
      })}
    </div>
  );
}
