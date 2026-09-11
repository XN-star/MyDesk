import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { TimeEntry } from '../../types';
import { toDateStr } from '../../lib/format';
import { todayFocus } from '../overview/overview';
import { useTaskStore } from '../../stores/tasks';
import { useTimerStore } from '../../stores/timer';
import { useUiStore } from '../../stores/ui';
import { FOCUS_MODES, displayTitleOf, findFocusModeTask } from './focusModes';

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 专注页：任务计时器 + 番茄钟 + 无任务专注模式 + 今日工时总结的唯一入口。 */
export default function FocusPage() {
  const running = useTimerStore((s) => s.running);
  const loadTimer = useTimerStore((s) => s.load);
  const startTimer = useTimerStore((s) => s.start);
  const stopTimer = useTimerStore((s) => s.stop);
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.load);
  const createTask = useTaskStore((s) => s.create);
  const toast = useUiStore((s) => s.toast);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [taskId, setTaskId] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [startingMode, setStartingMode] = useState<string | null>(null);

  useEffect(() => {
    void loadTimer();
    void loadTasks();
    api
      .settingsAll()
      .then((all) => {
        setFocusMin(Number(all.pomodoroFocus) || 25);
        setBreakMin(Number(all.pomodoroBreak) || 5);
      })
      .catch(() => {});
  }, [loadTimer, loadTasks]);

  // 今日条目：计时状态变化（开始/停止）后重拉
  useEffect(() => {
    const day = toDateStr(new Date());
    api
      .timeEntries(`${day}T00:00:00`, `${day}T23:59:59`)
      .then(setEntries)
      .catch(() => {});
  }, [running?.entry.id]);

  // 本地秒表：每秒走字，30s 与后端校准
  useEffect(() => {
    if (!running) return;
    setElapsed(running.elapsedSec);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const focus = useMemo(() => todayFocus(entries, tasks, new Date()), [entries, tasks]);
  const openTasks = tasks.filter((t) => t.status !== 'done');
  async function handleStart() {
    if (!taskId) {
      toast('先选择要专注的任务', 'error');
      return;
    }
    await startTimer(taskId);
  }

  async function handlePomodoro() {
    if (!taskId) {
      toast('先选择要专注的任务（也可仅计时：任意选一个）', 'error');
      return;
    }
    try {
      await api.pomodoroSet(focusMin, breakMin);
      await api.pomodoroStart(taskId);
      toast(`番茄开启：专注 ${focusMin} 分钟 / 休息 ${breakMin} 分钟`);
    } catch (e) {
      toast(`番茄开启失败：${e}`, 'error');
    }
  }

  /** 无任务专注：确保模式对应的隐藏任务存在，再以它开始计时。 */
  async function handleMode(modeName: string) {
    if (running || startingMode) return;
    setStartingMode(modeName);
    try {
      let task = findFocusModeTask(tasks, modeName);
      if (!task) {
        task = await createTask({ title: `focus_mode:${modeName}`, boardId: 'default' });
      } else if (task.status === 'done') {
        // 上次用完被打成完成，复活为待办再计时
        const revived = { ...task, status: 'todo' as const, doneAt: null };
        await useTaskStore.getState().update(revived);
        task = revived;
      }
      await startTimer(task.id);
    } catch {
      // 错误 toast 已由 store 统一处理
    } finally {
      setStartingMode(null);
    }
  }

  return (
    <div className="focus-page">
      <section className="panel focus-timer">
        <div className="focus-clock">{running ? mmss(elapsed) : mmss(0)}</div>
        <div className="focus-status">
          {running ? (
            <>正在专注：{displayTitleOf(running.taskTitle)}</>
          ) : (
            <>选择一个任务开始专注，或挑一种模式</>
          )}
        </div>
        <div className="focus-controls">
          {!running ? (
            <>
              <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">选择任务…</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {displayTitleOf(t.title)}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={() => void handleStart()}>
                ▶ 开始计时
              </button>
              <button className="btn" onClick={() => void handlePomodoro()}>
                🍅 番茄钟
              </button>
            </>
          ) : (
            <>
              <span className="pomodoro-inputs">
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={120}
                  value={focusMin}
                  onChange={(e) => setFocusMin(Number(e.target.value))}
                  style={{ width: 64 }}
                  title="专注分钟数"
                />
                /
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={60}
                  value={breakMin}
                  onChange={(e) => setBreakMin(Number(e.target.value))}
                  style={{ width: 64 }}
                  title="休息分钟数"
                />
                <button className="btn" onClick={() => void handlePomodoro()}>
                  🍅 番茄钟
                </button>
              </span>
              <button className="btn danger" onClick={() => void stopTimer()}>
                ⏹ 停止
              </button>
            </>
          )}
        </div>
        <p className="muted focus-hint">
          番茄到点自动停止计时并弹通知，随后进入休息；托盘图标悬停可看倒计时。
        </p>
      </section>

      {!running && (
        <section className="panel focus-modes">
          <h3>🌙 无任务专注</h3>
          <p className="muted focus-modes-hint">不挂任务也能计时——点一下就进入模式</p>
          <div className="mode-grid">
            {FOCUS_MODES.map((m) => (
              <button
                key={m.name}
                className="mode-card"
                disabled={startingMode !== null}
                onClick={() => void handleMode(m.name)}
                title={`约 ${m.suggestedMin} 分钟 · ${m.hint}`}
              >
                <span className="mode-emoji">{m.emoji}</span>
                <span className="mode-name">{m.name}</span>
                <span className="mode-min">{m.suggestedMin} 分钟</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel focus-report">
        <h3>⏱ 今日工时（{focus.totalMin} 分钟）</h3>
        {focus.byTask.length === 0 ? (
          <p className="muted">今天还没有专注记录</p>
        ) : (
          <ul className="overview-list">
            {focus.byTask.map((x) => (
              <li key={x.taskId}>
                <span className="ov-title">{displayTitleOf(x.title)}</span>
                <span className="ov-time">{x.minutes} 分钟</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
