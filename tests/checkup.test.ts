import { expect, test } from 'vitest';

import type { AnalysisResult, RiskWarning } from '../src/types';

import { buildCheckup } from '../src/lib/checkup';

const analysis = (): AnalysisResult => ({
  lines: [
    { lineNo: 1, raw: 'maxmemory 0', kind: 'directive', name: 'maxmemory', args: ['0'] },
    { lineNo: 2, raw: 'appendonly no', kind: 'directive', name: 'appendonly', args: ['no'] },
    { lineNo: 3, raw: 'slaveof 127.0.0.1 6379', kind: 'directive', name: 'slaveof' },
  ],
  byLine: new Map([
    [1, { lineNo: 1, status: 'changed' }],
    [3, { lineNo: 3, status: 'removed', note: '已废弃：改用 replicaof' }],
  ]),
  counts: { changed: 1, unknown: 0, removed: 1, newer: 0, duplicate: 0 },
  missing: ['bind'],
  firstLineOf: new Map(),
  effective: new Map(),
});

const warnings: RiskWarning[] = [
  { id: 'weak-requirepass', level: 'medium', message: 'requirepass 偏短', lineNos: [1], source: 'explicit' },
  { id: 'no-persistence', level: 'high', message: '没有持久化', lineNos: [], source: 'default' },
];

test('按固定顺序分组，空分组不出现', () => {
  const groups = buildCheckup(analysis(), warnings);
  expect(groups.map((group) => group.kind)).toEqual(['warning', 'missing', 'changed', 'removed']);
});

test('状态明细带指令名、当前值与真实行号', () => {
  const changed = buildCheckup(analysis(), warnings).find((group) => group.kind === 'changed');
  expect(changed?.items[0]).toMatchObject({ label: 'maxmemory', detail: 'maxmemory 0', lineNo: 1 });
});

test('废弃说明优先使用分析备注', () => {
  const removed = buildCheckup(analysis(), warnings).find((group) => group.kind === 'removed');
  expect(removed?.items[0].detail).toBe('已废弃：改用 replicaof');
});

test('无行号告警的 lineNo 为 null，有行号告警取首行', () => {
  const items = buildCheckup(analysis(), warnings).find((group) => group.kind === 'warning')?.items ?? [];
  expect(items.find((item) => item.id === 'warning-no-persistence')?.lineNo).toBeNull();
  expect(items.find((item) => item.id === 'warning-weak-requirepass')?.lineNo).toBe(1);
});

test('缺失项来自 analysis.missing', () => {
  const missing = buildCheckup(analysis(), warnings).find((group) => group.kind === 'missing');
  expect(missing?.items).toEqual([
    { id: 'missing-bind', kind: 'missing', label: 'bind', detail: '未显式配置', lineNo: null },
  ]);
});

test('没有指令名时回退为未知指令', () => {
  const result = analysis();
  result.lines.push({ lineNo: 4, raw: 'foo bar', kind: 'directive' });
  result.byLine.set(4, { lineNo: 4, status: 'unknown' });

  const unknown = buildCheckup(result, []).find((group) => group.kind === 'unknown');
  expect(unknown?.items[0].label).toBe('未知指令');
});
