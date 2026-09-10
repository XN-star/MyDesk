import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { useBoardsStore } from '../../stores/boards';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';
import type { Task } from '../../types';
import { STATUSES, tasksOfBoard } from './dnd';
import { searchTasks } from './search';
import TaskColumn from './TaskColumn';

export default function KanbanPage() {
  const tasks = useTaskStore((s) => s.tasks);
  const move = useTaskStore((s) => s.move);
  const openCreate = useUiStore((s) => s.openCreate);
  const openTask = useUiStore((s) => s.openTask);
  const boards = useBoardsStore((s) => s.boards);
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const setActive = useBoardsStore((s) => s.setActive);
  const loadBoards = useBoardsStore((s) => s.load);
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'rename' } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  // 当前看板被删除后兜底回落
  useEffect(() => {
    if (boards.length > 0 && !boards.some((b) => b.id === activeBoardId)) {
      setActive(boards[0].id);
    }
  }, [boards, activeBoardId, setActive]);

  const activeBoard = boards.find((b) => b.id === activeBoardId);
  const [keyword, setKeyword] = useState('');
  const visible = useMemo(
    () => searchTasks(tasksOfBoard(tasks, activeBoardId), keyword),
    [tasks, activeBoardId, keyword],
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const targetStatus = (STATUSES as string[]).includes(overId)
      ? (overId as Task['status'])
      : visible.find((t) => t.id === overId)?.status;
    if (!targetStatus) return;

    const column = visible
      .filter((t) => t.status === targetStatus && t.id !== activeId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    let index: number;
    if (overId === targetStatus || !column.some((t) => t.id === overId)) {
      index = column.length;
    } else {
      const overIdx = column.findIndex((t) => t.id === overId);
      const moving = visible.find((t) => t.id === activeId);
      index =
        moving && moving.sortOrder < column[overIdx].sortOrder ? overIdx + 1 : overIdx;
    }
    void move(activeId, targetStatus, index);
  }

  async function handleDeleteBoard() {
    if (!activeBoard) return;
    const count = visible.length;
    const ok = await confirm(`删除看板「${activeBoard.name}」？其中 ${count} 个任务将一并删除。`, {
      title: '删除看板',
    });
    if (ok) await useBoardsStore.getState().remove(activeBoard.id);
  }

  return (
    <div className="kanban-page">
      <div className="board-bar">
        <select
          className="input"
          value={activeBoardId}
          onChange={(e) => {
            if (e.target.value === '__new__') setDialog({ mode: 'create' });
            else setActive(e.target.value);
          }}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value="__new__">＋ 新建看板…</option>
        </select>
        {activeBoard && activeBoard.id !== 'default' && (
          <>
            <button className="btn" title="重命名看板" onClick={() => setDialog({ mode: 'rename' })}>
              ✎
            </button>
            <button className="btn danger" title="删除看板" onClick={() => void handleDeleteBoard()}>
              🗑
            </button>
          </>
        )}
        <input
          className="input kanban-search"
          placeholder="搜索任务…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ marginLeft: 'auto' }}
        />
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {STATUSES.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              tasks={visible
                .filter((t) => t.status === status)
                .sort((a, b) => a.sortOrder - b.sortOrder)}
              onAdd={() => openCreate(status)}
              onOpen={openTask}
            />
          ))}
        </div>
      </DndContext>
      {dialog && (
        <BoardDialog
          initialName={dialog.mode === 'rename' ? activeBoard?.name ?? '' : ''}
          title={dialog.mode === 'rename' ? '重命名看板' : '新建看板'}
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            if (dialog.mode === 'rename' && activeBoard) {
              await useBoardsStore.getState().rename(activeBoard.id, name);
            } else {
              await useBoardsStore.getState().create(name);
            }
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function BoardDialog({
  initialName,
  title,
  onClose,
  onSave,
}: {
  initialName: string;
  title: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const n = name.trim();
    if (!n) {
      setError('看板名称不能为空');
      return;
    }
    try {
      await onSave(n);
    } catch {
      /* store 已 toast，弹窗保留 */
    }
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="field">
          <label>看板名称</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：工作"
            autoFocus
          />
          {error && <small style={{ color: 'var(--danger)' }}>{error}</small>}
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={() => void handleSave()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
