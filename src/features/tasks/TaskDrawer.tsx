import { useState } from 'react';
import { fromLocalInput, toLocalInput } from '../../lib/format';
import { useTaskStore } from '../../stores/tasks';
import { useUiStore } from '../../stores/ui';

const PRIORITY_OPTIONS = [
  { value: 0, label: '低' },
  { value: 1, label: '中' },
  { value: 2, label: '高' },
  { value: 3, label: '紧急' },
];

export default function TaskDrawer() {
  const drawer = useUiStore((s) => s.drawer)!;
  const { closeDrawer, toast } = useUiStore();
  const { tasks, create, update, remove } = useTaskStore();
  const editing = drawer.mode === 'edit' ? tasks.find((t) => t.id === drawer.taskId) : undefined;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [priority, setPriority] = useState(editing?.priority ?? 1);
  const [dueAt, setDueAt] = useState(toLocalInput(editing?.dueAt ?? null));
  const [status, setStatus] = useState(
    editing?.status ?? (drawer.mode === 'create' ? drawer.status : 'todo'),
  );

  async function save() {
    if (!title.trim()) {
      toast('标题不能为空', 'error');
      return;
    }
    try {
      if (drawer.mode === 'create') {
        await create({
          title: title.trim(),
          description,
          priority,
          dueAt: fromLocalInput(dueAt),
          status,
        });
      } else if (editing) {
        await update({
          ...editing,
          title: title.trim(),
          description,
          priority,
          dueAt: fromLocalInput(dueAt),
          status,
        });
      }
      toast('已保存');
      closeDrawer();
    } catch {
      /* store 已 toast，保留输入不关闭 */
    }
  }

  async function del() {
    if (editing && window.confirm(`删除任务「${editing.title}」？`)) {
      await remove(editing.id);
      closeDrawer();
    }
  }

  return (
    <div className="overlay" onClick={closeDrawer}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h3>{drawer.mode === 'create' ? '新建任务' : '编辑任务'}</h3>
        <div className="field">
          <label>标题</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>描述</label>
          <textarea
            className="input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label>优先级</label>
          <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>截止时间</label>
          <input className="input" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div className="field">
          <label>状态</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="todo">待办</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
          </select>
        </div>
        <div className="drawer-actions">
          <button className="btn primary" onClick={save}>
            保存
          </button>
          {drawer.mode === 'edit' && (
            <button className="btn danger" onClick={del}>
              删除
            </button>
          )}
          <button className="btn" onClick={closeDrawer}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
