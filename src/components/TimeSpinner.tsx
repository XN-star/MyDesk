import { useEffect, useRef } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function Column({
  values,
  current,
  onChange,
  label,
}: {
  values: number[];
  current: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);

  function scrollToDate(v: number, smooth = false) {
    const el = listRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>(`[data-v="${v}"]`);
    if (item) {
      programmatic.current = true;
      item.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      setTimeout(() => (programmatic.current = false), 200);
    }
  }

  useEffect(() => {
    scrollToDate(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const idx = values.indexOf(current);
    const next = e.deltaY > 0 ? idx + 1 : idx - 1;
    if (next >= 0 && next < values.length) onChange(values[next]);
  }

  return (
    <div className="spinner-col">
      <button type="button" className="spinner-arrow" onClick={() => {
        const idx = values.indexOf(current);
        if (idx > 0) onChange(values[idx - 1]);
      }}>
        ▲
      </button>
      <div
        className="spinner-list"
        ref={listRef}
        onWheel={onWheel}
      >
        {values.map((v) => (
          <div
            key={v}
            data-v={v}
            className={`spinner-item${v === current ? ' active' : ''}`}
            onClick={() => onChange(v)}
          >
            {pad(v)}
          </div>
        ))}
      </div>
      <button type="button" className="spinner-arrow" onClick={() => {
        const idx = values.indexOf(current);
        if (idx < values.length - 1) onChange(values[idx + 1]);
      }}>
        ▼
      </button>
      <span className="spinner-label">{label}</span>
    </div>
  );
}

export default function TimeSpinner({
  value,
  onChange,
}: {
  value: string; // HH:MM
  onChange: (v: string) => void;
}) {
  const [h, m] = value.split(':').map(Number);

  function setHour(h2: number) {
    onChange(`${pad(h2)}:${pad(Number.isNaN(m) ? 0 : m)}`);
  }
  function setMinute(m2: number) {
    onChange(`${pad(Number.isNaN(h) ? 9 : h)}:${pad(m2)}`);
  }

  return (
    <div className="time-spinner">
      <Column values={HOURS} current={Number.isNaN(h) ? 9 : h} onChange={setHour} label="时" />
      <Column values={MINUTES} current={Number.isNaN(m) ? 0 : m} onChange={setMinute} label="分" />
    </div>
  );
}
