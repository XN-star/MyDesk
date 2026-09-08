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

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>(`[data-v="${current}"]`);
    item?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shift(delta: number) {
    const idx = values.indexOf(current);
    const next = idx + delta;
    if (next >= 0 && next < values.length) onChange(values[next]);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    shift(e.deltaY > 0 ? 1 : -1);
  }

  return (
    <div className="spinner-col">
      <button type="button" className="spinner-arrow" onClick={() => shift(-1)}>
        ▲
      </button>
      <div className="spinner-list" ref={listRef} onWheel={onWheel}>
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
      <button type="button" className="spinner-arrow" onClick={() => shift(1)}>
        ▼
      </button>
      <span className="spinner-label">{label}</span>
    </div>
  );
}

/** 时间选择：按钮显示 HH:MM，点击弹出滚轮弹层；点外部关闭。 */
export default function TimeSpinner({
  value,
  onChange,
}: {
  value: string; // HH:MM
  onChange: (v: string) => void;
}) {
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        boxRef.current?.classList.remove('open');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function togglePop() {
    boxRef.current?.classList.toggle('open');
  }

  function setHour(h2: number) {
    onChange(`${pad(h2)}:${pad(Number.isNaN(m) ? 0 : m)}`);
  }
  function setMinute(m2: number) {
    onChange(`${pad(Number.isNaN(h) ? 9 : h)}:${pad(m2)}`);
  }

  return (
    <div className="time-spinner" ref={boxRef}>
      <button type="button" className="btn picker-btn time-btn" onClick={togglePop}>
        {Number.isNaN(h) || Number.isNaN(m) ? '--:--' : `${pad(h)}:${pad(m)}`}
      </button>
      <div className="spinner-pop">
        <div className="spinner-pop-body">
          <Column values={HOURS} current={Number.isNaN(h) ? 9 : h} onChange={setHour} label="时" />
          <Column
            values={MINUTES}
            current={Number.isNaN(m) ? 0 : m}
            onChange={setMinute}
            label="分"
          />
        </div>
      </div>
    </div>
  );
}
