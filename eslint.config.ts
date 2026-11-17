import type { Linter } from 'eslint';

import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import oxcParser from 'eslint-parser-oxc';
import perfectionist from 'eslint-plugin-perfectionist';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

const CODE_FILES = ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'];

const RAW_EFFECT_MESSAGE =
  '禁止直接使用 useEffect / useLayoutEffect。副作用优先放到事件处理器里，或用渲染期派生代替；只有与 React 之外的系统同步、并且已列入 eslint.config.ts 允许清单的文件才可以使用。';

const sharedSyntax = [
  {
    selector: 'ForInStatement',
    message: '禁止 for...in 遍历数组或对象：使用 Object.keys / Object.entries 或 for...of。',
  },
  {
    selector: 'TSAnyKeyword',
    message: '禁止 any：请写出具体类型；边界数据用 unknown 并在入口处收窄。',
  },
  {
    selector: 'TSAsExpression > TSUnknownKeyword',
    message: '禁止 `as unknown as` 双重断言：它会绕过类型检查，请在边界处解析而不是强转。',
  },
  {
    selector: 'LabeledStatement',
    message: '禁止标签语句：用函数提前返回代替。',
  },
];

const rawEffectSyntax = [
  {
    selector: "CallExpression[callee.name='useEffect']",
    message: RAW_EFFECT_MESSAGE,
  },
  {
    selector: "CallExpression[callee.name='useLayoutEffect']",
    message: RAW_EFFECT_MESSAGE,
  },
  {
    selector: "MemberExpression[object.name='React'][property.name=/^use(Layout)?Effect$/]",
    message: RAW_EFFECT_MESSAGE,
  },
];

const baseRules: Linter.RulesRecord = {
  ...js.configs.recommended.rules,

  // 习惯约束：可读性优先，减少隐式行为
  curly: ['error', 'all'],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-console': ['error', { allow: ['warn', 'error'] }],
  'no-debugger': 'error',
  'no-else-return': 'error',
  'no-implicit-coercion': 'error',
  'no-nested-ternary': 'error',
  'no-param-reassign': ['error', { props: false }],
  'no-return-assign': 'error',
  'no-shadow': 'error',
  'no-unneeded-ternary': 'error',
  'no-useless-return': 'error',
  'no-var': 'error',
  'object-shorthand': 'error',
  'prefer-const': 'error',
  'prefer-template': 'error',
  radix: 'error',
  'array-callback-return': 'error',
  'no-duplicate-imports': 'error',
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],

  // TypeScript 已经负责未定义变量与类型检查
  'no-undef': 'off',
  'no-redeclare': 'off',

  // 导入顺序与注释门禁
  'perfectionist/sort-imports': 'error',
  'perfectionist/sort-named-imports': 'error',
  'eslint-comments/no-unlimited-disable': 'error',
  'eslint-comments/require-description': ['error', { ignore: ['eslint-enable'] }],

  // 仅在 lint 规则能表达的地方引入的团队规则
  'unicorn/no-abusive-eslint-disable': 'error',
  'unicorn/error-message': 'error',
  'unicorn/throw-new-error': 'error',
  'unicorn/prefer-number-properties': 'error',
  'unicorn/no-useless-undefined': 'error',
  'unicorn/prefer-includes': 'error',
  'unicorn/prefer-set-has': 'error',
  'unicorn/no-lonely-if': 'error',
  'unicorn/prefer-node-protocol': 'error',

  // 项目硬规则
  'no-restricted-syntax': ['error', ...sharedSyntax, ...rawEffectSyntax],
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'react',
          importNames: ['useEffect', 'useLayoutEffect'],
          message: RAW_EFFECT_MESSAGE,
        },
      ],
    },
  ],
};

export default defineConfig([
  globalIgnores([
    'dist/**',
    'node_modules/**',
    'coverage/**',
    'data/upstream/**',
    '.screenshots/**',
    '.trae-html-share-packages/**',
    '.superpowers/**',
    '.agents/**',
    '.claude/**',
  ]),
  {
    files: CODE_FILES,
    languageOptions: {
      parser: oxcParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    plugins: {
      'eslint-comments': eslintComments,
      perfectionist,
      unicorn,
    },
    extends: [reactHooks.configs.flat.recommended],
    rules: baseRules,
  },
  {
    // 未使用变量交给 tsc 的 noUnusedLocals / noUnusedParameters，避免 ESLint 核心规则误判类型声明
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.ts', 'vite.config.ts', 'eslint.config.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-console': 'off',
      'unicorn/prefer-node-protocol': 'error',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.vitest } },
    rules: {
      'no-console': 'off',
      // 测试允许用 as any 构造局部 fixture；生产代码仍然禁止 any
      'no-restricted-syntax': [
        'error',
        ...sharedSyntax.filter((entry) => entry.selector !== 'TSAnyKeyword'),
        ...rawEffectSyntax,
      ],
    },
  },
  {
    // 允许直接使用 effect 的文件清单：只放与 React 之外系统同步的代码。
    // 新增文件前先确认无法用事件处理器或渲染期派生解决，并在评审中说明原因。
    files: ['src/App.tsx', 'src/components/Editor.tsx', 'src/components/OfficialPane.tsx'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': ['error', ...sharedSyntax],
    },
  },
  {
    // src/lib 是纯函数层：不允许依赖 React
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: 'src/lib 必须保持纯函数：React 依赖放到组件中。',
            },
            {
              name: 'react-dom',
              message: 'src/lib 必须保持纯函数：DOM 依赖放到组件中。',
            },
          ],
        },
      ],
    },
  },
]);
