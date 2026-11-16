import { beforeEach, expect, test } from 'vitest';
import { loadState, saveState } from '../src/lib/persistence';

beforeEach(() => localStorage.clear());

const base = {
  v: 1 as const,
  line: '7.4',
  text: 'maxmemory 0\n',
  annotationMode: 'missing' as const,
  onlyDiff: false,
  showZh: true,
  bottomCollapsed: false,
};

test('round trips version, toggles and text', () => {
  saveState(base);
  expect(loadState()).toEqual(base);
});

test('never writes plaintext passwords', () => {
  saveState({ ...base, text: 'requirepass ${env_requirepass}\n' });
  expect(localStorage.getItem('zilucid:state')).not.toContain('requirepass s3cr3t');
  expect(() => saveState({ ...base, text: 'requirepass s3cr3t\n' })).toThrow();
});

test('invalid or absent state returns null', () => {
  localStorage.setItem('zilucid:state', '{oops');
  expect(loadState()).toBeNull();
});
