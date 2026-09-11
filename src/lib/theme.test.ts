import { beforeEach, describe, expect, it } from 'vitest';
import { ACCENTS, applyTheme, normalizeAccent, resolveDark } from './theme';

describe('resolveDark', () => {
  it('system 跟随系统', () => {
    expect(resolveDark('system', true)).toBe(true);
    expect(resolveDark('system', false)).toBe(false);
  });
  it('light 恒为浅色，dark 恒为深色', () => {
    expect(resolveDark('light', true)).toBe(false);
    expect(resolveDark('dark', false)).toBe(true);
  });
});

describe('normalizeAccent', () => {
  it('合法值原样返回，非法值回退 teal', () => {
    expect(normalizeAccent('indigo')).toBe('indigo');
    expect(normalizeAccent('nope')).toBe('teal');
    expect(normalizeAccent(undefined)).toBe('teal');
  });
});

describe('applyTheme accent', () => {
  beforeEach(() => {
    document.documentElement.className = '';
  });

  it('设置对应 accent class 且互斥', () => {
    applyTheme('light', 'indigo');
    expect(document.documentElement.classList.contains('accent-indigo')).toBe(true);
    expect(document.documentElement.classList.contains('accent-teal')).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
  it('dark 与 accent class 组合', () => {
    applyTheme('dark', 'slate');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('accent-slate')).toBe(true);
    expect(document.documentElement.classList.contains('accent-indigo')).toBe(false);
  });
  it('非法 accent 回退为 accent-teal', () => {
    // @ts-expect-error 运行时容错：非法值回退 teal
    applyTheme('light', 'nope');
    expect(document.documentElement.classList.contains('accent-teal')).toBe(true);
  });
  it('省略 accent 时默认 teal', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('accent-teal')).toBe(true);
  });
  it('ACCENTS 覆盖四个主题色', () => {
    expect(ACCENTS).toEqual(['teal', 'indigo', 'coral', 'slate']);
  });
});
