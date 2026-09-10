import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../types';
import { isOverdue } from '../../lib/format';
import { REPEAT_LABEL } from './repeat';

const PRIORITY_COLORS = ['#9ca3af', '#60a5fa', '#f59e0b', '#ef4444'];

export default function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
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
      </div>
    </div>
  );
}
