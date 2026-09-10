import { describe, expect, it } from 'vitest';
import { parseQuickTask } from './parseQuickTask';

// 2026-09-07 是周一
const now = new Date('2026-09-07T10:00:00');

describe('parseQuickTask', () => {
  it('明天 + 时间', () => {
    const r = parseQuickTask('明天 15:00 开周会', now);
    expect(r.title).toBe('开周会');
    expect(r.dueAt).toBe('2026-09-08T15:00:00');
  });

  it('今天 无时间 → 09:00', () => {
    const r = parseQuickTask('今天 散步', now);
    expect(r.title).toBe('散步');
    expect(r.dueAt).toBe('2026-09-07T09:00:00');
  });

  it('后天', () => {
    const r = parseQuickTask('后天 交作业', now);
    expect(r.dueAt).toBe('2026-09-09T09:00:00');
  });

  it('周X → 下一个该星期', () => {
    const r = parseQuickTask('周五 写周报', now);
    expect(r.dueAt).toBe('2026-09-11T09:00:00');
  });

  it('仅时间：未过 → 今天；已过 → 明天', () => {
    expect(parseQuickTask('14:30 站会', now).dueAt).toBe('2026-09-07T14:30:00');
    expect(parseQuickTask('08:00 晨跑', now).dueAt).toBe('2026-09-08T08:00:00');
  });

  it('X点半 写法', () => {
    expect(parseQuickTask('3点半 评审', now).dueAt).toBe('2026-09-07T15:30:00');
  });

  it('无日期短语 → dueAt 为 null', () => {
    const r = parseQuickTask('写周报', now);
    expect(r.title).toBe('写周报');
    expect(r.dueAt).toBeNull();
  });

  it('空输入', () => {
    expect(parseQuickTask('   ', now)).toEqual({
      title: '',
      dueAt: null,
      remindMinutesBefore: null,
      description: '',
    });
  });

  it('默认 remindMinutesBefore 为 null', () => {
    expect(parseQuickTask('明天 交报告', now).remindMinutesBefore).toBeNull();
  });
});

describe('parseQuickTask 重复短语', () => {
  it('每天 + 时间 → 提醒选项，时间未过取今天', () => {
    const r = parseQuickTask('每天 14:00 喝水', now);
    expect(r.title).toBe('喝水');
    expect(r.dueAt).toBe('2026-09-07T14:00:00');
    expect(r.remindMinutesBefore).toBe(0);
  });

  it('每天 + 时间已过 → 明天', () => {
    const r = parseQuickTask('每天 9:00 晨读', now);
    expect(r.dueAt).toBe('2026-09-08T09:00:00');
    expect(r.remindMinutesBefore).toBe(0);
  });

  it('每天无时间 → 默认 09:00', () => {
    const r = parseQuickTask('每天 站会', now);
    expect(r.dueAt).toBe('2026-09-08T09:00:00');
    expect(r.remindMinutesBefore).toBe(0);
  });

  it('每周X → 下一个该星期，准点提醒', () => {
    const r = parseQuickTask('每周五 18:00 写周报', now);
    expect(r.title).toBe('写周报');
    expect(r.dueAt).toBe('2026-09-11T18:00:00');
    expect(r.remindMinutesBefore).toBe(0);
  });

  it('每月X号 → 本月未过取本月，已过取下月', () => {
    const r1 = parseQuickTask('每月15号 10:00 交房租', now);
    expect(r1.dueAt).toBe('2026-09-15T10:00:00');
    expect(r1.remindMinutesBefore).toBe(0);
    const r2 = parseQuickTask('每月5号 交房租', now);
    expect(r2.dueAt).toBe('2026-10-05T09:00:00');
  });

  it('普通短语不受「每周X」误伤（先匹配日期短语时）', () => {
    // 「周五」单写仍是单次任务，无提醒
    const r = parseQuickTask('周五 写周报', now);
    expect(r.dueAt).toBe('2026-09-11T09:00:00');
    expect(r.remindMinutesBefore).toBeNull();
  });
});

describe('parseQuickTask #标签', () => {
  it('单个标签移入描述前缀', () => {
    const r = parseQuickTask('明天 15:00 交报告 #工作', now);
    expect(r.title).toBe('交报告');
    expect(r.dueAt).toBe('2026-09-08T15:00:00');
    expect(r.description).toBe('标签：工作');
  });

  it('多个标签按出现顺序合并', () => {
    const r = parseQuickTask('买菜 #生活 #采购', now);
    expect(r.title).toBe('买菜');
    expect(r.description).toBe('标签：生活、采购');
  });

  it('# 后无字符不识别，保留原文本', () => {
    const r = parseQuickTask('C# 学习', now);
    expect(r.title).toBe('C# 学习');
    expect(r.description).toBe('');
  });
});
