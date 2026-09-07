import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, TaskStatus } from '../../types';
import { STATUS_NAMES } from './dnd';
import TaskCard from './TaskCard';

export default function TaskColumn({
  status,
  tasks,
  onAdd,
  onOpen,
}: {
  status: TaskStatus;
  tasks: Task[];
  onAdd: () => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className={`kanban-col${isOver ? ' over' : ''}`}>
      <div className="kanban-col-head">
        <span>{STATUS_NAMES[status]}</span>
        <span className="kanban-count">{tasks.length}</span>
        <button className="btn" onClick={onAdd}>
          ＋
        </button>
      </div>
      <div ref={setNodeRef} className="kanban-col-body">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onClick={() => onOpen(t.id)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
