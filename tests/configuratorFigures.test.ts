import * as figures from '@lucasmarkes/hairline/react';
import { expect, test } from 'vitest';

import registry from '../src/data/configurator.json';

const ORIGINALS = new Set(Object.keys(figures));

test('每个区域都登记了存在的插图', () => {
  const missing = Object.entries(registry.sections)
    .filter(([, meta]) => !meta.figure || !ORIGINALS.has(meta.figure))
    .map(([id, meta]) => `${id} -> ${meta.figure ?? '（空）'}`);

  expect(missing).toEqual([]);
});

test('版本页与完成页的插图也登记了', () => {
  expect(registry.sections.__version__.figure).toBe('Laptop');
  expect(registry.sections.__finish__.figure).toBe('Terrain');
});
