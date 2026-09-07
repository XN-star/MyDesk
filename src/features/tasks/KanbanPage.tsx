import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';
import type { Task } from '../../types';
import { STATUSES } from './dnd';
import TaskColumn from './TaskColumn';

export default function KanbanPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const move = useTaskStore((s) => s.move);
  const openCreate = useUiStore((s) => s.openCreate);
  const openTask = useUiStore((s) => s.openTask);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const targetStatus = (STATUSES as string[]).includes(overId)
      ? (overId as Task['status'])
      : tasks.find((t) => t.id === overId)?.status;
    if (!targetStatus) return;

    const column = tasks
      .filter((t) => t.status === targetStatus && t.id !== activeId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    let index: number;
    if (overId === targetStatus || !column.some((t) => t.id === overId)) {
      index = column.length;
    } else {
      const overIdx = column.findIndex((t) => t.id === overId);
      const moving = tasks.find((t) => t.id === activeId);
      index =
        moving && moving.sortOrder < column[overIdx].sortOrder ? overIdx + 1 : overIdx;
    }
    void move(activeId, targetStatus, index);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="kanban">
        {STATUSES.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={tasks
              .filter((t) => t.status === status)
              .sort((a, b) => a.sortOrder - b.sortOrder)}
            onAdd={() => openCreate(status)}
            onOpen={openTask}
          />
        ))}
      </div>
    </DndContext>
  );
}
