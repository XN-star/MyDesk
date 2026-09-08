import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from '../../lib/api';
import type { Task } from '../../types';
import { parseQuickTask } from './parseQuickTask';

interface Hit {
  type: 'task';
  id: string;
  label: string;
}

function search(q: string, tasks: Task[]): Hit[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return tasks
    .filter((x) => x.title.toLowerCase().includes(s))
    .map((x) => ({ type: 'task' as const, id: x.id, label: x.title }))
    .slice(0, 8);
}

export default function QuickWindow() {
  const [q, setQ] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sel, setSel] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api
      .taskList()
      .then(setTasks)
      .catch(() => {});
  }, []);

  const hits = useMemo(() => search(q, tasks), [q, tasks]);

  async function hide() {
    await getCurrentWindow().hide();
    setQ('');
    setSel(0);
    setNotice('');
  }

  async function openHit(hit: Hit) {
    await emit('quick://open', { type: hit.type, id: hit.id });
    await hide();
  }

  async function createTask() {
    const parsed = parseQuickTask(q);
    if (!parsed.title) return;
    try {
      await api.taskCreate({ title: parsed.title, dueAt: parsed.dueAt });
      await emit('quick://changed');
      setNotice(`已创建：${parsed.title}`);
      setTimeout(() => void hide(), 900);
    } catch (e) {
      setNotice(`创建失败：${e}`);
    }
  }

  async function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      await hide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      if (hits[sel]) await openHit(hits[sel]);
      else await createTask();
    }
  }

  return (
    <div className="quick">
      <input
        className="quick-input"
        autoFocus
        placeholder="搜索或输入任务（支持：明天 15:00 / 周五 / 14:30）"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div className="quick-results">
        {hits.map((h, i) => (
          <div
            key={h.id}
            className={`quick-item${i === sel ? ' active' : ''}`}
            onClick={() => void openHit(h)}
          >
            <span className="quick-tag">任务</span>
            {h.label}
          </div>
        ))}
        {hits.length === 0 && q.trim() !== '' && !notice && (
          <div className="quick-hint">回车创建任务：{parseQuickTask(q).title}</div>
        )}
        {notice && <div className="quick-hint">{notice}</div>}
      </div>
    </div>
  );
}
