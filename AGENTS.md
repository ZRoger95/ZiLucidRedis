# AGENTS.md

ZiLucidRedis 是一个纯前端的 Redis 配置体检工具：贴入或上传 `redis.conf`，逐项对照官方默认值，标出被改过、不认识、已废弃和危险的配置，可编辑并导出新 conf。产品概览见 [README.md](README.md)，详细用法见 [docs/usage.md](docs/usage.md) 与 [docs/configurator.md](docs/configurator.md)；本文件是每次会话都需要的工程规则，不重复这些文档。

## 底线约束

- **纯前端，运行时零外部请求。** 不引入后端；构建产物由静态服务器托管，使用相对资源路径（`base: './'`）；新增数据只在构建期生成并提交。
- **明文密码不落盘。** 敏感指令导入时替换为 `${env_<指令名>}`，原值只存在内存；`localStorage`、默认导出和默认值不得含明文。守卫在 [persistence.ts](src/lib/persistence.ts)，替换在 [secrets.ts](src/lib/secrets.ts)。
- **生成数据不手改。** 生成物由脚本产出，要改数据先改登记表或脚本；清单与流程见 [数据管线](docs/engineering/data-pipeline.md)。
- **TypeScript strict。** 不新增 `any`，共享类型放 [types.ts](src/types.ts)；未使用变量由 `tsc` 把关。
- **源码不加普通注释。** 不在 `src/` 新增解释性注释或 JSDoc，需求与原因写入文档；ESLint 与 CSS 检查会阻止普通注释，工具指令注释与生成的 Redis 注释除外。见 [源码注释设计](docs/superpowers/specs/2026-11-21-source-comments-design.md)。
- **Lint 与格式门禁。** `npm run lint` 零告警，`eslint-disable` 写明原因；规则与取舍见 [eslint.md](docs/engineering/eslint.md)。
- **禁止直接使用 useEffect / useLayoutEffect。** 优先事件处理器与渲染期派生；例外只进 [eslint.config.ts](eslint.config.ts) 允许清单，替代方案见 [eslint.md](docs/engineering/eslint.md)。
- **界面文案中文。** 新增 UI 文案用中文；按最小宽度 1024px 的桌面端设计，不做移动端。
- **页面地址只允许一层。** 更深地址会 404 白屏；要加嵌套路由先改 `base` 并复核部署，见 [静态托管](docs/engineering/development.md#静态托管) 与 [生成向导设计](docs/superpowers/specs/2026-11-19-configurator-design.md) 的「待处理」。
- **先写测试再改行为。** `src/lib/` 纯函数必须有 Vitest 单测，边界先补能复现的测试；能用 lint/类型约束表达的优先做成确定性检查；安全与往返不变量由 `tests/*.property.test.ts` 覆盖。见 [开发与验证](docs/engineering/development.md)。

## UI 与 shadcn

- **先看现有组件。** 任何 UI 新增或改动前先读 [components.json](components.json) 和 [src/components/ui/](src/components/ui/)；需要新组件时用 `npx shadcn@latest add <name>` 生成并提交，不手写同类控件。
- **只从子路径导入。** 使用 `@/components/ui/button`、`/select`、`/switch`、`/dropdown-menu`、`/dialog`、`/command`、`/tabs` 等入口，不从 `src/components/ui` 的桶文件导入，不直接引 `radix-ui` 内部路径。
- **不自造控件。** 键盘、焦点、ARIA 和弹出层行为交给 shadcn（Radix）；优先用现有组件组合，不手写 `role=` 控件。
- **样式用 Tailwind。** 布局与控件样式写原子类；只有 CodeMirror 生成 DOM 的装饰与注释块允许写在 [editor.css](src/components/editor.css)。[index.css](src/index.css) 只保留 Tailwind 入口导入、设计令牌与 `@layer base`；全局 Tailwind 扩展指令放在 [tailwind-extensions.css](src/tailwind-extensions.css)。
- **ui-sdk 只用于 diff 行行为层。** 只有 [diffRows.ts](src/components/diffRows.ts) 使用 `@ui-sdk/core` 的 `createRovingFocus` 实现行导航；标准控件仍从 `@/components/ui/*` 组合，不得再引入 ui-sdk，也不引入 `@ui-sdk/core/web.css`，样式继续用 Tailwind。

## 目录

```
src/lib/         解析、归一化、分析、风险、密码占位、搜索、导出、diff（纯函数）
src/components/  工具栏、编辑器、摘要、详情、diff、搜索等 React 组件
src/components/ui/  shadcn 生成的控件，按项目观感直接维护
src/hooks/       React hook（快捷键等）
src/data/        人工登记表，以及按版本生成的字典与官方 conf
data/            版本白名单与上游抓取结果（versions.json、upstream/）
scripts/         构建期抓取与字典生成（Node 原生 TypeScript，ESM）
tests/           单测与构建脚本测试；fixtures/ 放样例
docs/            用户手册、工程规范、设计文档与实施计划
```

## 命令

```bash
npm install
npm run dev         # http://localhost:5173
npm run lint        # ESLint，零告警
npm run lint:fix
npm run format      # Prettier 写入
npm run format:check
npm run check       # lint + format:check + typecheck + test + 文档预算
npm test            # Vitest（jsdom）
npm run typecheck
npm run build       # lint + tsc --noEmit + vite build，产物在 dist/
npm run preview

node scripts/fetch-upstream.ts   # 拉取各 minor 线最新正式 release
node scripts/build-dict.ts       # 生成字典、官方 conf、releases.json、meta.json
```

数据脚本由 Node 原生 TypeScript 直接运行（Node 22.18+），会访问 GitHub；应用运行时不访问网络。解析异常会列出需要人工确认的指令，按提示登记到对应的 JSON 文件，不要绕过断言。

## 改动流程

- **新增能力：** 先在 `docs/superpowers/specs/` 写设计（现状、目标、非目标、已选方案和被放弃的方案），再在 `docs/superpowers/plans/` 写任务计划，然后实现；实现完成后把 spec 的状态改为「已实现」，并在计划文件头标 `状态：已实现`（步骤不必逐条勾选）。
- **修改现有行为：** 同步更新所属 spec 的现状描述，以及受影响的用户文档（[README.md](README.md)、[docs/usage.md](docs/usage.md)、[docs/configurator.md](docs/configurator.md)）。
- **修 bug：** 能直接定位就直接修，补一个能复现的测试；不新建设计文档。
- **提交信息：** 沿用现有前缀 `feat:` / `fix:` / `docs:` / `test:` / `refactor:`。
- **Git 提交规范：** 提交信息遵循 Conventional Commits，并由 Commitlint 在 Husky `commit-msg` Hook 中校验；提交前由 Husky `pre-commit` Hook 运行 lint-staged，对暂存代码执行 ESLint 与 Prettier。必须通过正常的 `git commit` 触发 Hook，禁止 `--no-verify`、`HUSKY=0`、临时改写 `core.hooksPath` 或其他绕过/替代提交流程的方式；不要代用户创建提交或推送，除非任务明确要求。
- **PR 正文：** 按 [.github/pull_request_template.md](.github/pull_request_template.md) 的四段填写；CI 校验四个标题齐全且「验证」非空，正文用于评审与交接，合并提交仍用默认 squash 消息。
- **合并入口：** PR 统一用 `npm run pr:merge -- <PR号>` 合并。脚本只接受 PR 号，内部执行 `gh pr merge --squash --auto` 并等待 GitHub 完成合并，不接受 `--subject`、`--body` 等参数。
- **完成前：** 至少运行 `npm run check` 和 `npm run build`；只报告实际运行的命令和结果。

## 文档治理

- 事实一处：根 AGENTS.md 只放每次会话必读规则；用法、工程细节、spec/plan 各归其层，不新增子目录 `AGENTS.md`。
- spec 写当前状态与取舍（`待评审` / `已实现` / `已废弃`），plan 是执行记录，完成后在文件头标状态。
- 设计必须带取舍，不写实现流水账；生成的配置清单、版本表以生成物或测试为准。
- 完整归属表、写作规则与本文件维护规则见 [docs/engineering/documentation.md](docs/engineering/documentation.md)。

## 维护本文件

- **体量上限：** 本文件由 `scripts/check-doc-budget.ts` 限制，上限见脚本；新增规则先改现有条目，超限先删减或迁移，确需上调时在 PR 备注说明理由，删减后同步下调上限。
