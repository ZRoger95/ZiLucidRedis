import { RuleTester } from 'eslint';
import { describe } from 'vitest';

import noSourceComments from '../scripts/no-source-comments-rule';

describe('no-source-comments', () => {
  const tester = new RuleTester({
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
  });

  tester.run('no-source-comments', noSourceComments, {
    valid: [
      'const value = 1;',
      '/// <reference types="vite/client" />',
      '/* eslint-disable no-alert -- required by this boundary */\nalert(value);',
      'const example = "/* not a comment */";',
    ],
    invalid: [
      { code: '// explanation\nconst value = 1;', errors: [{ message: '普通源码注释请移入文档。' }] },
      { code: '/** explanation */\nfunction value() {}', errors: [{ message: '普通源码注释请移入文档。' }] },
      { code: 'const value = <div>{/* explanation */}</div>;', errors: [{ message: '普通源码注释请移入文档。' }] },
    ],
  });
});
