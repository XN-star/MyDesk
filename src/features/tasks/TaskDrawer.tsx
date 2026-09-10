import { useState } from 'react';
import DatePicker from '../../components/DatePicker';
import TimeSpinner from '../../components/TimeSpinner';
import { dateOf } from '../../lib/format';
import { REMIND_OPTIONS, remindToNumber, remindToString } from '../../lib/remind';
import { REPEAT_LABEL } from './repeat';
import type { Repeat } from './repeat';
import { useBoardsStore } from '../../stores/boards';
import { useTaskStore } from '../../stores/tasks';
import { useTimerStore } from '../../stores/timer';
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
  const { tasks, create, update, remove, complete } = useTaskStore();
  const editing = drawer.mode === 'edit' ? tasks.find((t) => t.id === drawer.taskId) : undefined;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [priority, setPriority] = useState(editing?.priority ?? 1);
  const [dueDate, setDueDate] = useState(dateOf(editing?.dueAt ?? null) ?? '');
  const [dueTime, setDueTime] = useState(
    editing?.dueAt ? editing.dueAt.slice(11, 16) : '09:00',
  );
  const [hasDue, setHasDue] = useState(!!editing?.dueAt);
  const [remind, setRemind] = useState<string>(remindToString(editing?.remindMinutesBefore ?? 0));
  const [repeat, setRepeat] = useState<Repeat | null>(editing?.repeat ?? null);
  const [status, setStatus] = useState(
    editing?.status ?? (drawer.mode === 'create' ? drawer.status : 'todo'),
  );
  const boards = useBoardsStore((s) => s.boards);
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const [boardId, setBoardId] = useState(editing?.boardId ?? activeBoardId);

  function buildDueAt(): string | null {
    if (!hasDue || !dueDate) return null;
    return `${dueDate}T${dueTime}:00`;
  }

  function buildRemind(): number | null {
    if (!hasDue || !dueDate) return null;
    return remindToNumber(remind);
  }

  async function save() {
    if (!title.trim()) {
      toast('标题不能为空', 'error');
      return;
    }
    try {
      const dueAt = buildDueAt();
      const remindMinutesBefore = buildRemind();
      if (drawer.mode === 'create') {
        await create({
          title: title.trim(),
          description,
          priority,
          dueAt,
          status,
          remindMinutesBefore,
          boardId,
          repeat,
        });
      } else if (editing) {
        const next = {
          ...editing,
          title: title.trim(),
          description,
          priority,
          dueAt,
          status,
          remindMinutesBefore,
          boardId,
          repeat,
        };
        // 编辑中把状态改为 done 且带重复规则 → 走顺延生成
        if (status === 'done' && editing.status !== 'done' && repeat) {
          await complete({ ...next, doneAt: null });
        } else {
          await update(next);
        }
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
          <label className="field-label">
            <input
              type="checkbox"
              checked={hasDue}
              onChange={(e) => setHasDue(e.target.checked)}
            />
            截止时间（到点弹系统提醒）
          </label>
          {hasDue && (
            <div className="due-editor">
              <DatePicker
                value={dueDate}
                placeholder="选择日期"
                onChange={(d) => {
                  setDueDate(d ?? '');
                }}
              />
              <TimeSpinner value={dueTime} onChange={setDueTime} />
            </div>
          )}
        </div>
        {hasDue && (
          <div className="field">
            <label>提醒</label>
            <select
              className="input"
              value={remind}
              onChange={(e) => setRemind(e.target.value)}
              disabled={!dueDate}
              title={!dueDate ? '请先选择日期' : undefined}
            >
              {REMIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {hasDue && (
          <div className="field">
            <label>重复（完成后自动生成下一单）</label>
            <select
              className="input"
              value={repeat ?? ''}
              onChange={(e) => setRepeat((e.target.value || null) as Repeat | null)}
            >
              <option value="">不重复</option>
              {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>状态</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="todo">待办</option>
            <option value="doing">进行中</option>
            <option value="done">已完成</option>
          </select>
        </div>
        <div className="field">
          <label>所属看板</label>
          <select className="input" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="drawer-actions">
          {drawer.mode === 'edit' && editing && (
            <button
              className="btn"
              onClick={() => {
                void useTimerStore.getState().start(editing.id);
                toast('已开始专注');
                closeDrawer();
              }}
            >
              ▶ 开始专注
            </button>
          )}
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
