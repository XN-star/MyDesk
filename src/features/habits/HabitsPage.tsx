import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Habit, HabitFrequency } from '../../types';
import {
  bestStreak,
  currentScore,
  dailyChecked,
  heatmapData,
  streak,
} from './habits';
import { useHabitsStore } from '../../stores/habits';
import Celebration from '../../components/Celebration';

const FREQUENCY_LABEL: Record<HabitFrequency, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

const HEAT_WEEKS = 52;

export default function HabitsPage() {
  const habits = useHabitsStore((s) => s.habits);
  const logs = useHabitsStore((s) => s.logs);
  const selectedId = useHabitsStore((s) => s.selectedId);
  const load = useHabitsStore((s) => s.load);
  const select = useHabitsStore((s) => s.select);
  const toggle = useHabitsStore((s) => s.toggle);
  const remove = useHabitsStore((s) => s.remove);

  const [editing, setEditing] = useState<Habit | null>(null);
  const [showForm, setShowForm] = useState(false);
  const today = useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = habits.find((h) => h.id === selectedId) ?? null;

  async function handleDelete() {
    if (!current) return;
    const ok = await confirm(`删除习惯「${current.name}」及其全部打卡记录？`, {
      title: '删除习惯',
    });
    if (!ok) return;
    await remove(current.id);
  }

  return (
    <div className="habits-page">
      <Celebration />
      <section className="panel">
        <div className="habits-head">
          <h3>今日打卡</h3>
          <button
            className="btn primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            ＋ 新建习惯
          </button>
        </div>
        {habits.length === 0 ? (
          <div className="day-empty">还没有习惯，建一个开始坚持吧</div>
        ) : (
          <div className="habit-rows">
            {habits.map((h) => {
              const hLogs = logs.filter((l) => l.habitId === h.id);
              const checked = dailyChecked(logs, h.id, today);
              const score = currentScore(h, hLogs, today);
              return (
                <div
                  key={h.id}
                  data-habit-row={h.id}
                  className={`habit-row${h.id === selectedId ? ' active' : ''}`}
                  onClick={() => select(h.id)}
                >
                  <input
                    type="checkbox"
                    className="habit-check"
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => void toggle(h.id)}
                  />
                  <span className={`habit-name${checked ? ' done' : ''}`}>{h.name}</span>
                  <span className="habit-freq">{FREQUENCY_LABEL[h.frequency]}</span>
                  <span className={`habit-streak${checked ? ' bump' : ''}`} title="连续天数">
                    🔥 {streak(hLogs, today)}
                  </span>
                  <span className="habit-score" title="强度分数">
                    {Math.round(score * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {current && (
        <section className="panel">
          <div className="habits-head">
            <h3>{current.name} · 近一年</h3>
            <div className="habit-actions">
              <button
                className="btn"
                onClick={() => {
                  setEditing(current);
                  setShowForm(true);
                }}
              >
                编辑
              </button>
              <button className="btn danger" onClick={() => void handleDelete()}>
                删除
              </button>
            </div>
          </div>
          <HabitHeatmap habitId={current.id} logs={logs} today={today} />
          <div className="habit-summary">
            <span>
              当前连续 <b>{streak(logs.filter((l) => l.habitId === current.id), today)}</b> 天
            </span>
            <span>
              最长连续 <b>{bestStreak(logs.filter((l) => l.habitId === current.id))}</b> 天
            </span>
            <span>
              强度 <b>{Math.round(currentScore(current, logs.filter((l) => l.habitId === current.id), today) * 100)}%</b>
            </span>
            {current.reminder && <span>提醒 {current.reminder}</span>}
          </div>
        </section>
      )}

      {showForm && (
        <HabitForm
          editing={editing}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function HabitHeatmap({
  habitId,
  logs,
  today,
}: {
  habitId: string;
  logs: Array<{ id: string; habitId: string; date: string; value: number }>;
  today: string;
}) {
  const cells = useMemo(
    () => heatmapData(logs.filter((l) => l.habitId === habitId), HEAT_WEEKS, today),
    [logs, habitId, today],
  );
  const [start, ...rest] = cells;
  return (
    <div className="heatmap">
      <div className="heatmap-col">{start && <Cell key={start.date} cell={start} />}</div>
      {Array.from({ length: Math.ceil(rest.length / 7) }, (_, w) => (
        <div className="heatmap-col" key={w}>
          {rest.slice(w * 7, w * 7 + 7).map((c) => (
            <Cell key={c.date} cell={c} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Cell({ cell }: { cell: { date: string; value: number } }) {
  return (
    <span
      className={`hcell${cell.value > 0 ? ` v${cell.value}` : ''}`}
      title={`${cell.date}${cell.value === 1 ? '：已打卡' : cell.value === 2 ? '：跳过' : ''}`}
    />
  );
}

function HabitForm({ editing, onClose }: { editing: Habit | null; onClose: () => void }) {
  const create = useHabitsStore((s) => s.create);
  const update = useHabitsStore((s) => s.update);
  const [name, setName] = useState(editing?.name ?? '');
  const [frequency, setFrequency] = useState<HabitFrequency>(editing?.frequency ?? 'daily');
  const [hasRemind, setHasRemind] = useState(!!editing?.reminder);
  const [reminder, setReminder] = useState(editing?.reminder ?? '08:00');

  async function save() {
    if (!name.trim()) return;
    if (editing) {
      await update({
        ...editing,
        name: name.trim(),
        frequency,
        reminder: hasRemind ? reminder : null,
      });
    } else {
      await create({
        name: name.trim(),
        frequency,
        reminder: hasRemind ? reminder : null,
      });
    }
    onClose();
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{editing ? '编辑习惯' : '新建习惯'}</h3>
        <div className="field">
          <label>名称</label>
          <input
            className="input"
            autoFocus
            placeholder="如：每周健身"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        <div className="field">
          <label>频率</label>
          <select
            className="input"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
          >
            <option value="daily">每天</option>
            <option value="weekly">每周（约 2 次）</option>
            <option value="monthly">每月（约 2 次）</option>
          </select>
        </div>
        <div className="field">
          <label>提醒</label>
          <div className="field-row">
            <input
              type="checkbox"
              checked={hasRemind}
              onChange={(e) => setHasRemind(e.target.checked)}
            />
            {hasRemind && (
              <input
                type="time"
                className="input"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
              />
            )}
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
