import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type React from 'react';
import type { Task } from '../../types';
import { isOverdue } from '../../lib/format';
import { REPEAT_LABEL } from './repeat';
import { useTimerStore } from '../../stores/timer';
import { useTaskStore } from '../../stores/tasks';

const PRIORITY_COLORS = ['#9ca3af', '#60a5fa', '#f59e0b', '#ef4444'];

export default function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const running = useTimerStore((s) => s.running);
  const timerStart = useTimerStore((s) => s.start);
  const timerStop = useTimerStore((s) => s.stop);
  const tasks = useTaskStore((s) => s.tasks);
  const isTiming = running?.entry.taskId === task.id;

  // 卡片数据可能不是最新（repeat 完成后重建），用 store 里的最新任务校验存在性
  const live = tasks.find((t) => t.id === task.id) ?? task;

  function onTimerClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isTiming) void timerStop();
    else void timerStart(live.id);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="task-card"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={onClick}
    >
      <div className="task-card-title">
        {task.repeat && <span className="repeat-badge" title={`重复：${REPEAT_LABEL[task.repeat]}`}>↻</span>}
        {task.title}
      </div>
      <div className="task-card-meta">
        <span className="dot" style={{ background: PRIORITY_COLORS[task.priority] ?? '#9ca3af' }} />
        {task.dueAt && (
          <span className={isOverdue(task) ? 'due overdue' : 'due'}>
            {task.dueAt.slice(5, 16).replace('T', ' ')}
          </span>
        )}
        <button
          className={`btn task-timer-btn${isTiming ? ' active' : ''}`}
          title={isTiming ? '停止计时' : '开始专注'}
          onClick={onTimerClick}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isTiming ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  );
}
