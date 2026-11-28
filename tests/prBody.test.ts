import { describe, expect, test } from 'vitest';

import { validatePrBody } from '../scripts/lib/pr-body';

const VALID = `## 背景

说明为什么改。

## 改动

无。

## 验证

- \`npm run check\` 通过。

## 备注

无。
`;

describe('validatePrBody', () => {
  test('完整正文通过', () => {
    expect(validatePrBody(VALID)).toEqual([]);
  });

  test('缺少小节时报出具体标题', () => {
    const body = VALID.replace('## 备注\n\n无。\n', '');
    expect(validatePrBody(body)).toContain('缺少「## 备注」小节');
  });

  test('顺序与模板不一致时报错', () => {
    const body = `## 背景

说明。

## 验证

- \`npm run check\` 通过。

## 改动

无。

## 备注

无。
`;
    expect(validatePrBody(body).some((error) => error.startsWith('小节顺序应为'))).toBe(true);
  });

  test('验证只有注释和空白时报错', () => {
    const body = `## 背景

说明。

## 改动

无。

## 验证

<!-- 只写实际运行的命令和结果 -->

## 备注

无。
`;
    expect(validatePrBody(body)).toContain('「## 验证」小节为空：写出实际运行的命令和结果');
  });

  test('重复标题报错', () => {
    expect(validatePrBody(`${VALID}\n## 背景\n\n重复。\n`)).toContain('「## 背景」出现了 2 次');
  });

  test('代码块里的标题不算小节', () => {
    const body = VALID.replace('- `npm run check` 通过。', '```text\n## 备注\n```');
    expect(validatePrBody(body)).toEqual([]);
  });

  test('CRLF 换行等价', () => {
    expect(validatePrBody(VALID.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  test('标题前最多缩进三个空格仍算小节', () => {
    expect(validatePrBody(VALID.replace(/^## /gm, '   ## '))).toEqual([]);
  });

  test('空正文报四个缺项', () => {
    expect(validatePrBody('')).toHaveLength(4);
  });
});
