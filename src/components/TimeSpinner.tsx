import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

const POP_HEIGHT = 180;
const POP_WIDTH = 140;

/** 时间选择：按钮显示 HH:MM，点击经 portal 弹出滚轮弹层（fixed 定位，自动避开屏幕边缘）。 */
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function open() {
    const rect = btnRef.current!.getBoundingClientRect();
    const below = rect.bottom + 6;
    // 下方放得下就向下弹，否则向上弹；left 与按钮右对齐并夹紧到视口内。
    const top =
      below + POP_HEIGHT <= window.innerHeight
        ? below
        : Math.max(rect.top - 6 - POP_HEIGHT, 8);
    const left = Math.max(Math.min(rect.right - POP_WIDTH, window.innerWidth - POP_WIDTH - 8), 8);
    setPos({ top, left });
  }

  useLayoutEffect(() => {
    if (!pos || !popRef.current) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setPos(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pos]);

  function setHour(h2: number) {
    onChange(`${pad(h2)}:${pad(Number.isNaN(m) ? 0 : m)}`);
  }
  function setMinute(m2: number) {
    onChange(`${pad(Number.isNaN(h) ? 9 : h)}:${pad(m2)}`);
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="btn picker-btn time-btn"
        onClick={() => (pos ? setPos(null) : open())}
      >
        {Number.isNaN(h) || Number.isNaN(m) ? '--:--' : `${pad(h)}:${pad(m)}`}
      </button>
      {pos &&
        createPortal(
          <div className="spinner-pop" ref={popRef} style={{ top: pos.top, left: pos.left }}>
            <div className="spinner-pop-body">
              <Column values={HOURS} current={Number.isNaN(h) ? 9 : h} onChange={setHour} label="时" />
              <Column
                values={MINUTES}
                current={Number.isNaN(m) ? 0 : m}
                onChange={setMinute}
                label="分"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
