import { describe, expect, it } from 'vitest';
import { mergeNewDefaultModules } from './settings';

const MODULES = [
  { id: 'tasks', defaultEnabled: true },
  { id: 'calendar', defaultEnabled: true },
  { id: 'notes', defaultEnabled: true },
];

describe('mergeNewDefaultModules', () => {
  it('老用户首次升级：未记录过的默认模块并入并打标', () => {
    const r = mergeNewDefaultModules(['tasks', 'calendar'], [], MODULES);
    expect(r).toEqual({ enabled: ['tasks', 'calendar', 'notes'], merged: ['notes'] });
  });

  it('已合并过则返回 null（不重复启用用户禁用的模块）', () => {
    const r = mergeNewDefaultModules(['tasks'], ['notes', 'calendar'], MODULES);
    expect(r).toBeNull();
  });

  it('无默认模块可合并时返回 null', () => {
    const r = mergeNewDefaultModules(['tasks'], ['notes', 'calendar'], [
      { id: 'tasks', defaultEnabled: true },
    ]);
    expect(r).toBeNull();
  });
});
