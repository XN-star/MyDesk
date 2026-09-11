import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useTimerStore } from '../stores/timer';
import { useUiStore } from '../stores/ui';
import { displayTitleOf } from '../features/focus/focusModes';

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 常驻计时条：仅计时中显示，显示任务名与 mm:ss（1s 本地递增 + 后端校准）。 */
export default function TimerBar() {
  const running = useTimerStore((s) => s.running);
  const load = useTimerStore((s) => s.load);
  const stop = useTimerStore((s) => s.stop);
  const toast = useUiStore((s) => s.toast);
  const [elapsed, setElapsed] = useState(0);
  const [pomoOpen, setPomoOpen] = useState(false);

  useEffect(() => {
    if (!running) return;
    setElapsed(running.elapsedSec);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    void load();
    // 计时状态可能被托盘番茄自动停止，30s 与后端校准一次
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!running) return null;

  async function startPomodoro(focusMin: number, breakMin: number) {
    try {
      await api.pomodoroSet(focusMin, breakMin);
      await api.pomodoroStart(running?.entry.taskId ?? null);
      toast(`番茄开启：专注 ${focusMin} 分钟`);
    } catch (e) {
      toast(`番茄开启失败：${e}`, 'error');
    }
    setPomoOpen(false);
  }

  return (
    <div className="timer-bar">
      <span className="timer-dot" />
      <span className="timer-title">{displayTitleOf(running.taskTitle)}</span>
      <span className="timer-clock">{mmss(elapsed)}</span>
      <div className="timer-actions">
        <button className="btn" onClick={() => setPomoOpen((v) => !v)} title="番茄钟">
          🍅
        </button>
        <button className="btn danger" onClick={() => void stop()} title="停止计时">
          ⏹
        </button>
      </div>
      {pomoOpen && (
        <div className="timer-pomo">
          <button className="btn" onClick={() => void startPomodoro(25, 5)}>
            25/5
          </button>
          <button className="btn" onClick={() => void startPomodoro(45, 10)}>
            45/10
          </button>
          <button className="btn" onClick={() => void startPomodoro(50, 10)}>
            50/10
          </button>
        </div>
      )}
    </div>
  );
}
