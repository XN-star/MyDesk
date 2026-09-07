import { describe, expect, it } from 'vitest';
import { resolveDark } from './theme';

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
