import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { WorkoutLog, WorkoutType } from '../../types';
import { toDateStr } from '../../lib/format';
import { useFitnessStore } from '../../stores/fitness';
import {
  WORKOUT_EMOJI,
  WORKOUT_TYPES,
  bmi,
  bmiLabel,
  latestWeight,
  monthlyWorkouts,
  weightSeries,
  weeklyWorkouts,
} from './fitness';

const TREND_DAYS = 90;
const TREND_H = 120;
const TREND_W = 560;
const TREND_PAD = 8;

function fmtWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

function dateShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

export default function FitnessPage() {
  const weights = useFitnessStore((s) => s.weights);
  const workouts = useFitnessStore((s) => s.workouts);
  const goalWeight = useFitnessStore((s) => s.goalWeight);
  const height = useFitnessStore((s) => s.height);
  const load = useFitnessStore((s) => s.load);
  const removeWorkout = useFitnessStore((s) => s.removeWorkout);

  const [showWeightForm, setShowWeightForm] = useState(false);
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const today = toDateStr(new Date());

  useEffect(() => {
    void load();
  }, [load]);

  const current = useMemo(() => latestWeight(weights), [weights]);
  const series = useMemo(() => weightSeries(weights, today, TREND_DAYS), [weights, today]);
  const week = useMemo(() => weeklyWorkouts(workouts, today), [workouts, today]);
  const month = useMemo(() => monthlyWorkouts(workouts, today), [workouts, today]);
  const currentBmi = current && height > 0 ? bmi(current.weight, height) : null;
  const goalDelta =
    current && goalWeight > 0 ? Math.round((current.weight - goalWeight) * 10) / 10 : null;

  async function handleDeleteWorkout(w: WorkoutLog) {
    const ok = await confirm(`删除 ${dateShort(w.date)} 的「${w.type}」记录？`, {
      title: '删除锻炼记录',
    });
    if (!ok) return;
    await removeWorkout(w.id);
  }

  return (
    <div className="fitness-page">
      <section className="panel">
        <div className="fitness-head">
          <h3>⚖️ 体重趋势</h3>
          <div className="fitness-actions">
            <button className="btn" onClick={() => setShowProfile(true)}>
              身高 / 目标
            </button>
            <button className="btn primary" onClick={() => setShowWeightForm(true)}>
              ＋ 记录今日
            </button>
          </div>
        </div>
        {current ? (
          <div className="weight-now">
            <span className="weight-value">
              {fmtWeight(current.weight)}
              <small> kg</small>
            </span>
            <span className="muted weight-date">最近记录 {dateShort(current.date)}</span>
            {currentBmi !== null && (
              <span className="weight-bmi">
                BMI <b>{currentBmi.toFixed(1)}</b>（{bmiLabel(currentBmi)}）
              </span>
            )}
            {goalDelta !== null && (
              <span className={`weight-delta${goalDelta > 0 ? ' up' : ' down'}`}>
                {goalDelta > 0 ? `距目标还差 ${goalDelta} kg` : goalDelta < 0 ? `已超目标 ${-goalDelta} kg` : '已达目标 🎉'}
              </span>
            )}
          </div>
        ) : (
          <div className="day-empty">还没有体重记录，从今天开始吧</div>
        )}
        {series.length > 0 && <WeightTrendChart series={series} goal={goalWeight > 0 ? goalWeight : null} />}
        {goalWeight > 0 && current && <div className="weight-goal-line muted">目标 {fmtWeight(goalWeight)} kg · 近 {TREND_DAYS} 天趋势</div>}
      </section>

      <section className="panel">
        <div className="fitness-head">
          <h3>🏃 锻炼记录</h3>
          <button className="btn primary" onClick={() => setShowWorkoutForm(true)}>
            ＋ 记录锻炼
          </button>
        </div>
        <div className="workout-stats">
          <span>
            本周 <b>{week.count}</b> 次 · <b>{week.minutes}</b> 分钟
          </span>
          <span>
            本月 <b>{month.count}</b> 次 · <b>{month.minutes}</b> 分钟
          </span>
        </div>
        {workouts.length === 0 ? (
          <div className="day-empty">还没有锻炼记录，动起来才有轻盈感</div>
        ) : (
          <div className="workout-rows">
            {workouts.slice(0, 30).map((w) => (
              <div key={w.id} className="workout-row">
                <span className="workout-icon">{WORKOUT_EMOJI[w.type] ?? '💪'}</span>
                <span className="workout-main">
                  <span>
                    {w.type} <b>{w.minutes}</b> 分钟
                  </span>
                  {w.note && <span className="muted workout-sub">{w.note}</span>}
                </span>
                <span className="muted workout-date">{dateShort(w.date)}</span>
                <span className="workout-ops">
                  <button className="btn tiny danger" onClick={() => void handleDeleteWorkout(w)}>
                    删除
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {showWeightForm && <WeightForm onClose={() => setShowWeightForm(false)} />}
      {showWorkoutForm && <WorkoutForm onClose={() => setShowWorkoutForm(false)} />}
      {showProfile && <ProfileForm onClose={() => setShowProfile(false)} />}
    </div>
  );
}

/** SVG 自绘体重折线（近 90 天），可选目标虚线。 */
function WeightTrendChart({
  series,
  goal,
}: {
  series: Array<{ date: string; weight: number }>;
  goal: number | null;
}) {
  const values = series.map((p) => p.weight);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (goal !== null) {
    min = Math.min(min, goal);
    max = Math.max(max, goal);
  }
  const pad = Math.max((max - min) * 0.15, 0.5);
  min -= pad;
  max += pad;
  const x = (i: number) =>
    TREND_PAD + (i / Math.max(series.length - 1, 1)) * (TREND_W - TREND_PAD * 2);
  const y = (v: number) =>
    TREND_H - TREND_PAD - ((v - min) / (max - min)) * (TREND_H - TREND_PAD * 2);
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1).toFixed(1)},${TREND_H - TREND_PAD} L${x(0).toFixed(1)},${TREND_H - TREND_PAD} Z`;

  return (
    <svg className="weight-chart" viewBox={`0 0 ${TREND_W} ${TREND_H}`} role="img" aria-label="体重趋势图">
      <path className="weight-area" d={area} />
      {goal !== null && (
        <line className="weight-goal" x1={TREND_PAD} x2={TREND_W - TREND_PAD} y1={y(goal)} y2={y(goal)} />
      )}
      <path className="weight-line" d={line} />
      {series.map((p, i) =>
        i === series.length - 1 ? <circle key={p.date} className="weight-dot" cx={x(i)} cy={y(p.weight)} r="3.5" /> : null,
      )}
      <text className="weight-tick" x={TREND_PAD} y={TREND_H - 1}>
        {dateShort(series[0].date)}
      </text>
      <text className="weight-tick end" x={TREND_W - TREND_PAD} y={TREND_H - 1}>
        {dateShort(series[series.length - 1].date)}
      </text>
    </svg>
  );
}

function WeightForm({ onClose }: { onClose: () => void }) {
  const upsertWeight = useFitnessStore((s) => s.upsertWeight);
  const weights = useFitnessStore((s) => s.weights);
  const today = toDateStr(new Date());
  const existing = weights.find((w) => w.date === today);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState(existing ? fmtWeight(existing.weight) : '');

  async function save() {
    const kg = Number(value.trim());
    if (!value.trim() || !Number.isFinite(kg) || kg <= 0 || kg > 500) return;
    await upsertWeight(date, Math.round(kg * 10) / 10);
    onClose();
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>记录体重</h3>
        <div className="field">
          <label>体重（kg）</label>
          <input
            className="input"
            autoFocus
            inputMode="decimal"
            placeholder="如 65.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </div>
        <div className="field">
          <label>日期</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {existing && date === today && <p className="muted form-hint">今天已记录 {fmtWeight(existing.weight)} kg，再次保存将覆盖</p>}
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

function WorkoutForm({ onClose }: { onClose: () => void }) {
  const createWorkout = useFitnessStore((s) => s.createWorkout);
  const [type, setType] = useState<WorkoutType>('跑步');
  const [minutes, setMinutes] = useState('30');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(toDateStr(new Date()));

  async function save() {
    const mins = Number(minutes.trim());
    if (!Number.isFinite(mins) || mins <= 0 || mins > 1440) return;
    await createWorkout({ date, type, minutes: Math.round(mins), note: note.trim() });
    onClose();
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>记录锻炼</h3>
        <div className="field">
          <label>类型</label>
          <div className="cat-chips">
            {WORKOUT_TYPES.map((t) => (
              <button key={t} className={`chip${type === t ? ' active' : ''}`} onClick={() => setType(t)}>
                {WORKOUT_EMOJI[t]} {t}
              </button>
            ))}
          </div>
        </div>
        <div className="field-row-2">
          <div className="field">
            <label>时长（分钟）</label>
            <input
              className="input"
              autoFocus
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
            />
          </div>
          <div className="field">
            <label>日期</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>备注</label>
          <input
            className="input"
            placeholder="选填，如 5 公里"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
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

function ProfileForm({ onClose }: { onClose: () => void }) {
  const goalWeight = useFitnessStore((s) => s.goalWeight);
  const height = useFitnessStore((s) => s.height);
  const setGoalWeight = useFitnessStore((s) => s.setGoalWeight);
  const setHeight = useFitnessStore((s) => s.setHeight);
  const [goal, setGoal] = useState(goalWeight > 0 ? fmtWeight(goalWeight) : '');
  const [h, setH] = useState(height > 0 ? String(height) : '');

  async function save() {
    const g = Number(goal.trim());
    const hh = Number(h.trim());
    await setGoalWeight(Number.isFinite(g) && g > 0 ? Math.round(g * 10) / 10 : 0);
    await setHeight(Number.isFinite(hh) && hh > 0 ? Math.round(hh) : 0);
    onClose();
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>身高 / 目标体重</h3>
        <div className="field">
          <label>身高（cm），用于计算 BMI</label>
          <input
            className="input"
            autoFocus
            inputMode="numeric"
            placeholder="如 175"
            value={h}
            onChange={(e) => setH(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </div>
        <div className="field">
          <label>目标体重（kg），留空清除</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="如 65"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
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
