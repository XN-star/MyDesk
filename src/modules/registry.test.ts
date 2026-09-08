import { describe, expect, it } from 'vitest';
import { enabledModules, MODULES } from './registry';

describe('registry', () => {
  it('包含任务看板、日历、笔记三个内置模块', () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual(['calendar', 'notes', 'tasks']);
  });

  it('enabledModules 只返回启用的模块且保持注册顺序', () => {
    const result = enabledModules(['calendar']);
    expect(result.map((m) => m.id)).toEqual(['calendar']);
  });
});
