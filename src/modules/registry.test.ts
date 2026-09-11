import { describe, expect, it } from 'vitest';
import { enabledModules, MODULES } from './registry';

describe('registry', () => {
  it('包含今日速览、任务看板、心流专注、时光月历、习惯打卡、灵感速记、随手记账、轻盈计划、快捷入口九个内置模块', () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual([
      'calendar',
      'fitness',
      'focus',
      'habits',
      'ledger',
      'links',
      'notes',
      'overview',
      'tasks',
    ]);
  });

  it('所有模块名都是四字', () => {
    for (const m of MODULES) {
      expect(m.name.length, `模块 ${m.id} 名称「${m.name}」应为四字`).toBe(4);
    }
  });

  it('enabledModules 只返回启用的模块且保持注册顺序', () => {
    const result = enabledModules(['calendar']);
    expect(result.map((m) => m.id)).toEqual(['calendar']);
  });
});
