import { useEffect, useRef, useState } from 'react';
import MonthGrid from './MonthGrid';

export default function DatePicker({
  value,
  onChange,
  placeholder = '选择日期',
}: {
  value: string; // YYYY-MM-DD 或空
  onChange: (date: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    value ? new Date(value) : new Date(),
  );
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(ds: string) {
    onChange(ds);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
  }

  return (
    <div className="date-picker" ref={boxRef}>
      <button type="button" className="btn picker-btn" onClick={() => setOpen((o) => !o)}>
        {value || <span className="picker-placeholder">{placeholder}</span>}
      </button>
      {value && (
        <button
          type="button"
          className="picker-clear"
          title="清除日期"
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          ✕
        </button>
      )}
      {open && (
        <div className="picker-pop">
          <div className="picker-head">
            <button type="button" className="btn" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <span className="calendar-title">
              {viewMonth.getFullYear()} 年 {viewMonth.getMonth() + 1} 月
            </span>
            <button type="button" className="btn" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <MonthGrid month={viewMonth} selectedDate={value} onPick={pick} />
        </div>
      )}
    </div>
  );
}
