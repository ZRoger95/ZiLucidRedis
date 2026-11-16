import { expect, test } from 'vitest';
import { parseConf } from '../src/lib/parseConf';
import { analyze } from '../src/lib/analyze';

const doc = (name: string, defaultValue: string | null, type = 'string') =>
  ({ name, section: 'NETWORK', type, defaultValue, defaultSource: 'config.c', range: null, sensitive: false, modifiable: true, comment: [] }) as any;

const dict = {
  line: '7.4',
  tag: '7.4.5',
  sections: [{ id: 'NETWORK', title: 'NETWORK', startLine: 1 }],
  directives: [doc('maxclients', '10000'), doc('maxmemory', '0', 'ulonglong'), doc('save', '3600 1', 'special')],
} as any;

const run = (text: string) => analyze(parseConf(text), dict, {} as any, '7.4', { slaveof: 'replicaof' });

test('default and changed are distinguished', () => {
  const result = run('maxclients 10000\nmaxmemory 100mb\n');
  expect(result.byLine.get(1)!.status).toBe('default');
  expect(result.byLine.get(2)!.status).toBe('changed');
});

test('unknown names are reported', () => {
  expect(run('whatever-enabled yes').byLine.get(1)!.status).toBe('unknown');
});

test('repeated save is not a duplicate, repeated maxclients is', () => {
  const save = run('save 3600 1\nsave 300 100\n');
  expect(save.counts.duplicate).toBe(0);
  const dup = run('maxclients 1\nmaxclients 2\n');
  expect(dup.counts.duplicate).toBe(1);
  expect(dup.byLine.get(2)!.status).toBe('duplicate');
});

test('include and loadmodule are special, never unknown', () => {
  const result = run('include /etc/redis/local.conf\nloadmodule /opt/m.so\n');
  expect(result.byLine.get(1)!.status).toBe('special');
  expect(result.byLine.get(2)!.status).toBe('special');
  expect(result.counts.unknown).toBe(0);
});

test('an empty file yields zero counts and a steady missing list', () => {
  const result = run('');
  expect(result.counts.changed + result.counts.unknown + result.counts.duplicate).toBe(0);
  expect(result.missing).toContain('maxmemory');
});

test('effective values fall back to defaults when the line is absent', () => {
  const result = run('save 3600 1\n');
  expect(result.effective.get('maxmemory')![0]).toBe('0');
});
