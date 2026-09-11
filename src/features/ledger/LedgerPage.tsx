import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { LedgerEntry, LedgerKind } from '../../types';
import { toDateStr } from '../../lib/format';
import { useLedgerStore } from '../../stores/ledger';
import {
  CATEGORY_EMOJI,
  budgetProgress,
  categoriesOf,
  categoryBreakdown,
  centsToYuan,
  monthSummary,
  yuanToCents,
} from './ledger';

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${Number(m)}月`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

function dateLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  const wd = WEEKDAY[new Date(`${date}T00:00:00`).getDay()];
  return `${m}月${d}日 · 周${wd}`;
}

export default function LedgerPage() {
  const entries = useLedgerStore((s) => s.entries);
  const month = useLedgerStore((s) => s.month);
  const budget = useLedgerStore((s) => s.budget);
  const load = useLedgerStore((s) => s.load);
  const setMonth = useLedgerStore((s) => s.setMonth);
  const remove = useLedgerStore((s) => s.remove);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const today = toDateStr(new Date());

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => monthSummary(entries), [entries]);
  const slices = useMemo(() => categoryBreakdown(entries, 'expense'), [entries]);
  const budgetState = useMemo(() => budgetProgress(summary.expense, budget), [summary.expense, budget]);

  // 按日分组（entries 已按日期降序）
  const groups = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()];
  }, [entries]);

  async function handleDelete(entry: LedgerEntry) {
    const ok = await confirm(`删除这笔「${entry.category} ${centsToYuan(entry.amount)} 元」记录？`, {
      title: '删除记录',
    });
    if (!ok) return;
    await remove(entry.id);
  }

  return (
    <div className="ledger-page">
      <section className="panel">
        <div className="ledger-head">
          <div className="month-switch">
            <button className="btn" onClick={() => void setMonth(shiftMonth(month, -1))}>
              ‹
            </button>
            <h3>{monthLabel(month)}</h3>
            <button className="btn" onClick={() => void setMonth(shiftMonth(month, 1))}>
              ›
            </button>
          </div>
          <button
            className="btn primary"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            ＋ 记一笔
          </button>
        </div>
        <div className="ledger-summary">
          <div className="summary-item">
            <span className="muted">收入</span>
            <b className="income">+{centsToYuan(summary.income)}</b>
          </div>
          <div className="summary-item">
            <span className="muted">支出</span>
            <b className="expense">-{centsToYuan(summary.expense)}</b>
          </div>
          <div className="summary-item">
            <span className="muted">结余</span>
            <b>{centsToYuan(summary.balance)}</b>
          </div>
        </div>
        <div className="budget-box">
          {editingBudget ? (
            <BudgetEditor
              budget={budget}
              onDone={(cents) => {
                if (cents !== null) void useLedgerStore.getState().setBudget(cents);
                setEditingBudget(false);
              }}
            />
          ) : (
            <button className="budget-row" onClick={() => setEditingBudget(true)} title="点击设置月预算">
              {budget > 0 ? (
                <>
                  <span>
                    本月预算 {centsToYuan(budget)} 元 · 已用{' '}
                    {Math.min(100, Math.round(budgetState.ratio * 100))}%
                    {budgetState.over && '（超支啦）'}
                  </span>
                  <div className={`budget-bar${budgetState.over ? ' over' : ''}`}>
                    <div
                      className="budget-fill"
                      style={{ width: `${Math.min(100, budgetState.ratio * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className="muted">📊 设置一个月预算，花钱心里有数 →</span>
              )}
            </button>
          )}
        </div>
        {slices.length > 0 && (
          <div className="category-chart">
            {slices.map((s) => (
              <div className="cat-row" key={s.category}>
                <span className="cat-name">
                  {CATEGORY_EMOJI[s.category] ?? '📦'} {s.category}
                </span>
                <div className="cat-bar">
                  <div className="cat-fill" style={{ width: `${Math.max(2, s.ratio * 100)}%` }} />
                </div>
                <span className="cat-amount">
                  {centsToYuan(s.amount)} · {Math.round(s.ratio * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        {entries.length === 0 ? (
          <div className="day-empty">这个月还没有记录，记下第一笔吧</div>
        ) : (
          groups.map(([date, list]) => {
            const dayNet = list.reduce(
              (sum, e) => sum + (e.kind === 'income' ? e.amount : -e.amount),
              0,
            );
            return (
              <div key={date} className="ledger-day">
                <div className="ledger-day-head">
                  <span>
                    {dateLabel(date)}
                    {date === today && <span className="today-tag">今天</span>}
                  </span>
                  <span className={`muted${dayNet < 0 ? ' expense' : ' income'}`}>
                    {dayNet >= 0 ? '+' : '-'}
                    {centsToYuan(Math.abs(dayNet))}
                  </span>
                </div>
                {list.map((e) => (
                  <div key={e.id} className="ledger-row">
                    <span className="ledger-cat">{CATEGORY_EMOJI[e.category] ?? '📦'}</span>
                    <span className="ledger-main">
                      <span className="ledger-note">{e.note || e.category}</span>
                      <span className="muted ledger-sub">{e.category}</span>
                    </span>
                    <span className={`ledger-amount ${e.kind}`}>
                      {e.kind === 'income' ? '+' : '-'}
                      {centsToYuan(e.amount)}
                    </span>
                    <span className="ledger-ops">
                      <button
                        className="btn tiny"
                        onClick={() => {
                          setEditing(e);
                          setShowForm(true);
                        }}
                      >
                        编辑
                      </button>
                      <button className="btn tiny danger" onClick={() => void handleDelete(e)}>
                        删除
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </section>

      {showForm && (
        <LedgerForm
          editing={editing}
          defaultDate={month === toDateStr(new Date()).slice(0, 7) ? today : `${month}-01`}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function BudgetEditor({
  budget,
  onDone,
}: {
  budget: number;
  onDone: (cents: number | null) => void;
}) {
  const [value, setValue] = useState(budget > 0 ? centsToYuan(budget) : '');
  return (
    <div className="budget-edit">
      <input
        className="input"
        autoFocus
        inputMode="decimal"
        placeholder="每月预算（元）"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone(yuanToCents(value));
          if (e.key === 'Escape') onDone(null);
        }}
      />
      <button className="btn primary" onClick={() => onDone(yuanToCents(value))}>
        保存
      </button>
      <button className="btn" onClick={() => onDone(null)}>
        取消
      </button>
    </div>
  );
}

function LedgerForm({
  editing,
  defaultDate,
  onClose,
}: {
  editing: LedgerEntry | null;
  defaultDate: string;
  onClose: () => void;
}) {
  const create = useLedgerStore((s) => s.create);
  const update = useLedgerStore((s) => s.update);
  const [kind, setKind] = useState<LedgerKind>(editing?.kind ?? 'expense');
  const [amount, setAmount] = useState(editing ? centsToYuan(editing.amount) : '');
  const [category, setCategory] = useState(editing?.category ?? '餐饮');
  const [note, setNote] = useState(editing?.note ?? '');
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const cats = categoriesOf(kind);

  async function save() {
    const cents = yuanToCents(amount);
    if (cents === null) return;
    if (editing) {
      await update({ ...editing, kind, amount: cents, category, note: note.trim(), date });
    } else {
      await create({ kind, amount: cents, category, note: note.trim(), date });
    }
    onClose();
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <div className="kind-switch">
          {(['expense', 'income'] as LedgerKind[]).map((k) => (
            <button
              key={k}
              className={`kind-btn${kind === k ? ' active' : ''}`}
              onClick={() => {
                setKind(k);
                if (!cats.includes(category)) setCategory(cats[0]);
              }}
            >
              {k === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>
        <div className="field">
          <label>金额</label>
          <input
            className="input ledger-amount-input"
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </div>
        <div className="field">
          <label>分类</label>
          <div className="cat-chips">
            {cats.map((c) => (
              <button
                key={c}
                className={`chip${category === c ? ' active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_EMOJI[c] ?? '📦'} {c}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>备注</label>
          <input
            className="input"
            placeholder="选填"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </div>
        <div className="field">
          <label>日期</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
