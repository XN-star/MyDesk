import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from '../../lib/api';
import type { Link, Task } from '../../types';
import { entryMode } from '../links/quickEntry';
import { kindIcon } from '../links/links';
import { parseQuickTask } from './parseQuickTask';

interface Hit {
  type: 'task' | 'link';
  id: string;
  label: string;
  link?: Link;
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
  const [links, setLinks] = useState<Link[]>([]);
  const [sel, setSel] = useState(0);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.taskList().then(setTasks).catch(() => {});
    api.linkList().then(setLinks).catch(() => {});
  }, []);

  const entry = useMemo(() => entryMode(links, q), [links, q]);
  const hits: Hit[] = useMemo(() => {
    if (entry) {
      return entry.list.map((l, i) => ({
        type: 'link' as const,
        id: l.id,
        label: `${entry.query === '' ? i + 1 + '. ' : ''}${kindIcon(l.kind)} ${l.title || l.target}`,
        link: l,
      }));
    }
    return search(q, tasks);
  }, [entry, q, tasks]);
  const selIndex = Math.min(sel, Math.max(hits.length - 1, 0));

  async function hide() {
    await getCurrentWindow().hide();
    setQ('');
    setSel(0);
    setNotice('');
  }

  async function openHit(hit: Hit) {
    if (hit.type === 'task') {
      await emit('quick://open', { type: hit.type, id: hit.id });
      await hide();
    } else if (hit.link) {
      try {
        if (hit.link.kind === 'command') await api.linkRun(hit.link.id);
        else await api.linkOpen(hit.link.kind, hit.link.target);
      } catch (e) {
        setNotice(`打开失败：${e}`);
        return;
      }
      await hide();
    }
  }

  async function createTask() {
    const parsed = parseQuickTask(q);
    if (!parsed.title) return;
    try {
      await api.taskCreate({
        title: parsed.title,
        description: parsed.description,
        dueAt: parsed.dueAt,
        remindMinutesBefore: parsed.remindMinutesBefore,
      });
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
      if (entry) {
        const hit = hits[selIndex];
        if (hit) await openHit(hit);
      } else if (hits[sel]) await openHit(hits[sel]);
      else await createTask();
    }
  }

  const placeholder = entry
    ? entry.query === ''
      ? '入口模式：回车打开选中，输入 1-9 切换'
      : '入口过滤：回车打开选中'
    : '搜索或输入任务（明天 15:00 / 每天 9:00 / #标签 / 空格=入口）';

  return (
    <div className="quick">
      <input
        className="quick-input"
        autoFocus
        placeholder={placeholder}
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
            key={`${h.type}-${h.id}`}
            className={`quick-item${(entry ? i === selIndex : i === sel) ? ' active' : ''}`}
            onClick={() => void openHit(h)}
          >
            <span className="quick-tag">{h.type === 'task' ? '任务' : '入口'}</span>
            {h.label}
          </div>
        ))}
        {!entry && hits.length === 0 && q.trim() !== '' && !notice && (
          <div className="quick-hint">回车创建任务：{parseQuickTask(q).title}</div>
        )}
        {notice && <div className="quick-hint">{notice}</div>}
      </div>
    </div>
  );
}
