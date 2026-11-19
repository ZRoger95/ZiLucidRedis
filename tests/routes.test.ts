import { expect, test } from 'vitest';

import { parseRoute, routeHash } from '../src/lib/routes';

test.each([
  ['#/configurator', 'configurator'],
  ['#/configurator/', 'configurator'],
  ['', 'checkup'],
  ['#/', 'checkup'],
  ['#/anything', 'checkup'],
] as const)('%s 解析为 %s', (hash, route) => {
  expect(parseRoute(hash)).toBe(route);
});

test('路由对应回 hash', () => {
  expect(routeHash('configurator')).toBe('#/configurator');
  expect(routeHash('checkup')).toBe('');
});
