# ESLint、格式化与门禁

状态：已实现（2026-11-17）

本文记录 lint / format / 类型检查的分工、规则取舍和提交门禁。具体规则以 [eslint.config.ts](../../eslint.config.ts) 为准，本文不复制完整规则表。

## 分工

| 工具 | 负责 | 不负责 |
|---|---|---|
| ESLint | 正确性、团队习惯、架构边界 | 缩进、换行、引号 |
| Prettier | 代码格式 | 逻辑与习惯 |
| `tsc` | 类型、未使用变量（`noUnusedLocals` / `noUnusedParameters`） | 代码风格 |

ESLint 9 起已把格式规则移出核心，React 官方与 Prettier 官方也都建议“ESLint 管质量，Prettier 管格式”。因此本项目不启用 `@stylistic`，也不在 ESLint 里配置换行宽度。

## 参考基线

选型参考了以下公开配置和规范，只保留与这个项目相关的部分：

| 来源 | 采用 | 未采用 |
|---|---|---|
| `eslint:recommended` | 核心正确性规则 | — |
| React `eslint-plugin-react-hooks` 的 `recommended` | `rules-of-hooks`、`exhaustive-deps`，以及 React Compiler 的 `set-state-in-effect`、`refs`、`purity`、`immutability` 等规则 | — |
| Next.js `eslint-config-next/core-web-vitals` | “React + Hooks 规则默认开启，Web Vitals 相关规则升级为 error”的思路 | Next.js 专用规则 |
| Airbnb JavaScript Style Guide / `eslint-config-airbnb-typescript` | `curly`、`eqeqeq`、`no-var`、`prefer-const`、`no-param-reassign`、`no-nested-ternary`、导入排序等习惯 | 整套配置（包含大量 CommonJS/ES5 时代的规则） |
| `typescript-eslint` 的 `strict` / `stylistic` | “语法层能查的错误尽量在 lint 阶段查”的思路 | 当前无法启用，原因见下文 |
| Google TypeScript Style Guide | 禁止 `any`，边界数据用 `unknown`；优先 `??`、`for...of` | 其命名与注释格式细节 |
| Alibaba F2E 规范 | 用 lint 严重级别表达强制性：强制项为 error，建议项为 warn | 具体业务规则 |

## 规则分组

规则分为五组，新增规则时先判断属于哪一组，避免把格式问题塞进 ESLint。

**正确性**

- 核心 `eslint:recommended`。
- `react-hooks/recommended` 全量开启，包括 React Compiler 的规则。
- `react-hooks/set-state-in-effect` 禁止在 effect 里同步 `setState`，这是“不要用 effect 派生状态”的可执行版本。

**类型**

- 禁止 `any`（`TSAnyKeyword`），边界数据用 `unknown` 收窄。
- 禁止 `as unknown as` 双重断言。
- 未使用变量交给 `tsc`；ESLint 核心的 `no-unused-vars` 会把 TypeScript 类型声明误判为未使用，因此对 TS 文件关闭。

**结构**

- `src/lib/**` 是纯函数层，禁止导入 `react` / `react-dom`。
- `useEffect` / `useLayoutEffect` 默认禁止，允许清单见下一节。
- 测试目录允许用 `as any` 构造局部 fixture；生产代码不允许。

**可读性**

- `curly`、`no-else-return`、`no-nested-ternary`、`eqeqeq`、`prefer-template`、`object-shorthand`、`no-shadow`、`no-unneeded-ternary`、`no-param-reassign`。
- `no-console` 只允许 `warn` / `error`；`scripts/` 和 `tests/` 例外。
- `no-debugger`、禁止 `for...in`、禁止标签语句。

**导入与注释**

- `perfectionist/sort-imports`、`perfectionist/sort-named-imports` 负责导入顺序；`no-duplicate-imports` 禁止重复导入。
- `eslint-comments/require-description`：所有 `eslint-disable` 必须写原因。
- `eslint-comments/no-unlimited-disable`：禁止整文件关闭规则。
- `linterOptions.reportUnusedDisableDirectives: 'error'`：失效的 disable 注释直接报错。

## useEffect 禁令

默认禁止直接导入或调用 `useEffect` / `useLayoutEffect`。先按顺序尝试替代方案：

1. 能在事件处理器里做吗？（提交、点击、拖拽、输入）
2. 能在渲染期派生吗？（`useMemo`、普通变量、`key` 重置状态）
3. 真的是在“把 React 状态推给外部系统”或“订阅外部系统”吗？

只有第三个问题成立才允许使用，并且必须进入 [eslint.config.ts](../../eslint.config.ts) 的允许清单。当前清单：

| 文件 | 原因 |
|---|---|
| `src/App.tsx` | 异步加载版本字典；写入 `localStorage`；清理一次性交接并同步编辑器会话（vault、文件名） |
| `src/components/Editor.tsx` | 挂载 / 销毁 / 同步 CodeMirror 实例 |
| `src/components/OfficialPane.tsx` | 渲染提交后滚动到焦点行 |
| `src/hooks/useShortcut.ts` | 订阅全局键盘事件 |
| `src/hooks/useVersionData.ts` | 按版本动态 `import()` 字典与官方 conf |

新增文件需要改配置并说明原因，评审时重点看“为什么不能用事件处理器或渲染期派生”。已有的反例：搜索面板关闭时重置查询，改为在 `onOpenChange` 里清空，不再用 effect 监听 `open`。

不提供 `useEffect` 包装 Hook。React 19.3 的 `exhaustive-deps` 和 Compiler 规则无法分析穿透自定义 Hook 的 effect，包装后依赖检查会失效；文件级允许清单更可靠。

## 配置加载

- 配置文件是 [eslint.config.ts](../../eslint.config.ts)；ESLint 10 通过 `jiti` 加载 TypeScript 配置。配置本身已加入 `tsconfig.json` 的 `include`，`npm run typecheck` 会一起检查。
- 不使用 `.eslintignore`：flat config 不再读取该文件，忽略项统一写在配置的 `globalIgnores` 中（`dist/`、`node_modules/`、`data/upstream/`、生成目录等）。
- [.editorconfig](../../.editorconfig) 只负责编辑器基础项（编码、缩进、行尾空格、最终换行），不重复 Prettier 的引号和行宽；代码格式以 `.prettierrc.json` 为唯一来源。行尾统一交给 git 的 `core.autocrlf`，配置里不写 `end_of_line`。
- Prettier 有独立的 [.prettierignore](../../.prettierignore)，不要把它和 ESLint 的忽略项混在一起。

## 门禁

```bash
npm run lint          # ESLint，--max-warnings=0
npm run format:check  # Prettier 检查
npm run typecheck     # tsc --noEmit
npm test              # Vitest
npm run check         # 以上四项依次执行
npm run build         # lint + typecheck + vite build
```

- 合并前必须通过 `npm run check`。
- `npm run build` 已包含 lint，构建失败即视为门禁失败。
- 本地修复用 `npm run lint:fix` 和 `npm run format`。
- 不提交没有说明的 `eslint-disable`；如果确实需要长期例外，优先改 `eslint.config.ts` 的允许清单，而不是在业务代码里逐行关闭。
- CI 或发布流程必须至少执行 `npm run check` 和 `npm run build`。
- Vitest 用 `vmThreads` 池复用 jsdom 环境（见 `vite.config.ts`）：threads 池每文件新建环境，高负载下会偶发 5s 超时。

## 为什么没有 typescript-eslint

当前依赖是 TypeScript 7（原生编译器）。TypeScript 7.0 不提供 JavaScript 编译器 API，`@typescript-eslint/parser` 无法运行；其稳定版声明的支持范围也仍是 `< 6.1`。因此：

- 解析器使用 `eslint-parser-oxc`（Rust 解析器，无 `typescript` 运行时依赖），只跑语法层规则。
- 类型检查、未使用变量、类型收窄由 `tsc` 的 `strict` + `noUnusedLocals` + `noUnusedParameters` 负责。
- 等 TypeScript 7.1 恢复编译器 API 后，再评估迁移回 `typescript-eslint` 的类型感知规则。

`eslint-plugin-react` 与 `eslint-plugin-jsx-a11y` 当前稳定版只声明支持到 ESLint 9，本项目使用 ESLint 10，暂不引入；可访问性交给 shadcn（Radix）组件。

## 维护

- 新增规则先补一个能复现问题的用例，再决定 error 还是 warn；门禁要求零告警，所以新增规则默认是 error。
- 纠正固化为确定性检查的流程见 `AGENTS.md`「先写测试再改行为」条目：优先 lint/类型约束与性质测试，而非自然语言规则。
- 规则与 `eslint.config.ts` 不一致时，以配置文件为准，并同步更新本文的分组说明。
- 生成目录（`dist/`、`data/upstream/`、`src/data/dict/`、`src/data/official/`）不参与 lint 和格式化。

## 参考

- [ESLint: Rules](https://eslint.org/docs/latest/rules/)
- [React: eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)
- [React: You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [Next.js: ESLint Plugin](https://nextjs.org/docs/app/api-reference/config/eslint)
- [typescript-eslint: Getting Started](https://typescript-eslint.io/getting-started/)
- [typescript-eslint: Dependency Versions](https://typescript-eslint.io/users/dependency-versions/)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [Alibaba F2E 前端规范](https://alibaba.github.io/f2e-spec/)
- [Prettier: Integrating with Linters](https://prettier.io/docs/integrating-with-linters)
