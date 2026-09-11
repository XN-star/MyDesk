import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Habit, HabitFrequency } from '../../types';
import {
  bestStreak,
  currentScore,
  dailyChecked,
  habitCounts,
  hitMilestone,
  streak,
} from './habits';
import { useHabitsStore } from '../../stores/habits';
import { quickHabitStates } from './quickHabits';
import Celebration from '../../components/Celebration';

const FREQUENCY_LABEL: Record<HabitFrequency, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
};

export default function HabitsPage() {
  const habits = useHabitsStore((s) => s.habits);
  const logs = useHabitsStore((s) => s.logs);
  const selectedId = useHabitsStore((s) => s.selectedId);
  const load = useHabitsStore((s) => s.load);
  const select = useHabitsStore((s) => s.select);
  const toggle = useHabitsStore((s) => s.toggle);
  const remove = useHabitsStore((s) => s.remove);
  const create = useHabitsStore((s) => s.create);

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
  const quickStates = useMemo(() => quickHabitStates(habits), [habits]);
  const allTaken = quickStates.every((q) => q.taken);

  /** 速建：一键创建常用每日习惯并选中；已存在（taken）的点击无事发生。 */
  async function handleQuickAdd(name: string) {
    if (useHabitsStore.getState().habits.some((h) => !h.archived && h.name === name)) return;
    await create({ name, frequency: 'daily' });
  }

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
          <div className="habit-grid">
            {habits.map((h) => {
              const hLogs = logs.filter((l) => l.habitId === h.id);
              const checked = dailyChecked(logs, h.id, today);
              const score = currentScore(h, hLogs, today);
              return (
                <div
                  key={h.id}
                  data-habit-row={h.id}
                  className={`habit-card${h.id === selectedId ? ' selected' : ''}`}
                  onClick={() => select(h.id)}
                >
                  <div className="habit-card-main">
                    <span className={`habit-name${checked ? ' done' : ''}`}>{h.name}</span>
                    <span className="habit-card-meta">
                      <span className="habit-freq">{FREQUENCY_LABEL[h.frequency]}</span>
                      <span className={`habit-streak${checked ? ' bump' : ''}`} title="连续天数">
                        🔥 {streak(hLogs, today)}
                      </span>
                      <span className="habit-score" title="强度分数">
                        {Math.round(score * 100)}%
                      </span>
                    </span>
                  </div>
                  <button
                    className={`habit-check-btn${checked ? ' checked' : ''}`}
                    title={checked ? '取消打卡' : '打卡'}
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggle(h.id);
                    }}
                  >
                    ✓
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {!allTaken && (
          <div className="quick-habits">
            <span className="muted quick-habits-label">常用速建</span>
            <div className="quick-habit-chips">
              {quickStates.map((q) => (
                <button
                  key={q.name}
                  className={`chip quick-habit-chip${q.taken ? ' taken' : ''}`}
                  disabled={q.taken}
                  title={q.taken ? '已存在同名习惯' : `新建每日习惯「${q.name}」`}
                  onClick={() => void handleQuickAdd(q.name)}
                >
                  {q.taken ? '✓ ' : ''}
                  {q.emoji} {q.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {current && (
        <HabitDetail
          habit={current}
          logs={logs}
          today={today}
          onEdit={() => {
            setEditing(current);
            setShowForm(true);
          }}
          onDelete={() => void handleDelete()}
        />
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

/** 选中习惯的统计详情：本周/本月/本年次数 + 连续/强度大数字块。 */
function HabitDetail({
  habit,
  logs,
  today,
  onEdit,
  onDelete,
}: {
  habit: Habit;
  logs: Array<{ id: string; habitId: string; date: string; value: number }>;
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hLogs = useMemo(() => logs.filter((l) => l.habitId === habit.id), [logs, habit.id]);
  const counts = useMemo(() => habitCounts(logs, habit.id, today), [logs, habit.id, today]);
  const days = streak(hLogs, today);
  const milestone = dailyChecked(logs, habit.id, today) ? hitMilestone(days) : null;

  return (
    <section className="panel">
      <div className="habits-head">
        <h3>{habit.name} · 统计</h3>
        <div className="habit-actions">
          <button className="btn" onClick={onEdit}>
            编辑
          </button>
          <button className="btn danger" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>
      <div className="habit-stats-grid">
        <StatItem value={counts.week} label="本周" />
        <StatItem value={counts.month} label="本月" />
        <StatItem value={counts.year} label="本年" />
        <StatItem value={days} label="连续天数" fire />
        <StatItem value={bestStreak(hLogs)} label="最长连续" />
        <StatItem value={`${Math.round(currentScore(habit, hLogs, today) * 100)}%`} label="强度" />
      </div>
      <div className="habit-summary">
        {habit.reminder && <span>提醒 {habit.reminder}</span>}
        {milestone && <span className="habit-milestone">🎉 里程碑：连续 {milestone} 天！</span>}
      </div>
    </section>
  );
}

function StatItem({ value, label, fire }: { value: number | string; label: string; fire?: boolean }) {
  return (
    <div className="stat-item">
      <b>
        {fire ? '🔥 ' : ''}
        {value}
      </b>
      <span>{label}</span>
    </div>
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
