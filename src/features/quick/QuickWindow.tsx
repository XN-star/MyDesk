import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from '../../lib/api';
import type { Link, SearchHit, Task } from '../../types';
import { entryMode } from '../links/quickEntry';
import { kindIcon } from '../links/links';
import { parseQuickTask } from './parseQuickTask';

interface Hit {
  type: 'task' | 'link' | 'note';
  id: string;
  label: string;
  sub?: string;
  link?: Link;
}

const KIND_TAG: Record<SearchHit['kind'], string> = {
  task: '任务',
  note: '笔记',
  link: '入口',
};

function localTaskHits(q: string, tasks: Task[]): Hit[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return tasks
    .filter((x) => x.title.toLowerCase().includes(s))
    .map((x) => ({ type: 'task' as const, id: x.id, label: x.title }))
    .slice(0, 8);
}

/** FTS 命中转展示项；任务类去重（本地命中优先，避免同任务重复出现）。 */
function mergeHits(local: Hit[], fts: SearchHit[]): Hit[] {
  const seenTask = new Set(local.filter((h) => h.type === 'task').map((h) => h.id));
  const ftsHits: Hit[] = fts
    .filter((h) => !(h.kind === 'task' && seenTask.has(h.refId)))
    .map((h) => ({
      type: h.kind as Hit['type'],
      id: h.refId,
      label: h.title || '（无标题）',
      sub: h.body ? h.body.slice(0, 30) : undefined,
    }));
  return [...local, ...ftsHits].slice(0, 12);
}

export default function QuickWindow() {
  const [q, setQ] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [sel, setSel] = useState(0);
  const [notice, setNotice] = useState('');
  const [ftsHits, setFtsHits] = useState<SearchHit[]>([]);
  const composeRef = useRef(false);
  const ftsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.taskList().then(setTasks).catch(() => {});
    api.linkList().then(setLinks).catch(() => {});
  }, []);

  // FTS 全局搜索：200ms 防抖；输入法组合中不发
  useEffect(() => {
    if (ftsTimer.current) clearTimeout(ftsTimer.current);
    const query = q.trim();
    if (!query || query.startsWith(' ') || query.startsWith('/')) {
      setFtsHits([]);
      return;
    }
    ftsTimer.current = setTimeout(() => {
      if (composeRef.current) return;
      api.globalSearch(query).then(setFtsHits).catch(() => setFtsHits([]));
    }, 200);
    return () => {
      if (ftsTimer.current) clearTimeout(ftsTimer.current);
    };
  }, [q]);

  const entry = useMemo(() => entryMode(links, q), [links, q]);
  const local = useMemo(() => localTaskHits(q, tasks), [q, tasks]);
  const hits: Hit[] = useMemo(() => {
    if (entry) {
      return entry.list.map((l, i) => ({
        type: 'link' as const,
        id: l.id,
        label: `${entry.query === '' ? i + 1 + '. ' : ''}${kindIcon(l.kind)} ${l.title || l.target}`,
        link: l,
      }));
    }
    return mergeHits(local, ftsHits);
  }, [entry, local, ftsHits]);
  const selIndex = Math.min(sel, Math.max(hits.length - 1, 0));

  async function hide() {
    await getCurrentWindow().hide();
    setQ('');
    setSel(0);
    setNotice('');
    setFtsHits([]);
  }

  async function openHit(hit: Hit) {
    if (hit.type === 'link' && hit.link) {
      try {
        if (hit.link.kind === 'command') await api.linkRun(hit.link.id);
        else await api.linkOpen(hit.link.kind, hit.link.target);
      } catch (e) {
        setNotice(`打开失败：${e}`);
        return;
      }
      await hide();
      return;
    }
    await emit('quick://open', { type: hit.type, id: hit.id });
    await hide();
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
      } else if (hits[selIndex]) await openHit(hits[selIndex]);
      else await createTask();
    }
  }

  const placeholder = entry
    ? entry.query === ''
      ? '入口模式：回车打开选中，输入 1-9 切换'
      : '入口过滤：回车打开选中'
    : '搜索任务/笔记/入口，或输入任务（每天 9:00 / #标签 / 空格=入口）';

  const showCreateHint =
    !entry && hits.length === 0 && q.trim() !== '' && !notice && parseQuickTask(q).title !== '';

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
        onCompositionStart={() => {
          composeRef.current = true;
        }}
        onCompositionEnd={() => {
          composeRef.current = false;
        }}
        onKeyDown={onKeyDown}
      />
      <div className="quick-results">
        {hits.map((h, i) => (
          <div
            key={`${h.type}-${h.id}`}
            className={`quick-item${(entry ? i === selIndex : i === selIndex) ? ' active' : ''}`}
            onClick={() => void openHit(h)}
          >
            <span className="quick-tag">{KIND_TAG[h.type] ?? '任务'}</span>
            <span className="quick-item-label">
              {h.label}
              {h.sub && <span className="quick-item-sub">{h.sub}</span>}
            </span>
          </div>
        ))}
        {showCreateHint && <div className="quick-hint">回车创建任务：{parseQuickTask(q).title}</div>}
        {notice && <div className="quick-hint">{notice}</div>}
      </div>
    </div>
  );
}
