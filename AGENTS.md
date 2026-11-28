# AGENTS.md

ZiLucidRedis 是一个纯前端的 Redis 配置体检工具：贴入或上传 `redis.conf`，逐项对照官方默认值，标出被改过、不认识、已废弃和危险的配置，可编辑并导出新 conf。产品概览见 [README.md](README.md)，详细用法见 [docs/usage.md](docs/usage.md) 与 [docs/configurator.md](docs/configurator.md)；本文件是每次会话都需要的工程规则，不重复这些文档。

本文件是唯一的 agent 规则入口。不要把规则复制到子目录，也不要新增子目录级 `AGENTS.md`。

## 底线约束

- **纯前端，运行时零外部请求。** 不引入后端；构建产物必须能由静态服务器托管，并用相对资源路径（`base: './'`）以便整体部署到任意目录或子路径。新增数据一律在构建期生成并提交。
- **明文密码不落盘。** 敏感指令在导入时即替换为 `${env_<指令名>}`；原值只存在于内存；`localStorage`、默认导出和任何默认值都不得含明文。守卫在 [persistence.ts](src/lib/persistence.ts)，替换逻辑在 [secrets.ts](src/lib/secrets.ts)。
- **生成数据不手改。** `src/data/dict/*.json`、`src/data/official/*.conf`、`src/data/releases.json`、`src/data/dict/meta.json` 由脚本生成；人工维护的是 `data/versions.json`、`src/data/no-default.json`、`src/data/defaults-override.json`、`src/data/renames.json`、`src/data/aliases.ts`、`src/data/zh-notes.json`、`src/data/risk-rules.json`、`src/data/extra-directives.json`、`src/data/configurator.json`、`src/data/scenarios.json`、`src/data/sentinel-rules.json`。
- **TypeScript strict。** 不新增 `any`；共享类型放 [types.ts](src/types.ts)。未使用变量由 `tsc` 的 `noUnusedLocals` / `noUnusedParameters` 把关。
- **源码不加普通注释。** AI Agent 不得在 `src/` 手写源码中新增解释性注释或 JSDoc；需求、原因和设计约束写入对应文档。过时注释可能误导后续 Agent，因此由 ESLint 与 CSS 检查门禁阻止普通注释。仅保留工具必需的指令注释（如 ESLint 指令、TypeScript 三斜线引用）；生成的 Redis 配置注释属于产品数据，不受此规则限制。
- **Lint 与格式门禁。** ESLint 管正确性和团队习惯，Prettier 管格式；`npm run lint` 必须零告警，`eslint-disable` 必须写原因。规则与取舍见 [docs/engineering/eslint.md](docs/engineering/eslint.md)。
- **禁止直接使用 useEffect / useLayoutEffect。** 优先事件处理器和渲染期派生；只有与 React 之外系统同步的文件才能进入 [eslint.config.ts](eslint.config.ts) 的允许清单。清单与替代方案见 [docs/engineering/eslint.md](docs/engineering/eslint.md)。
- **界面文案中文。** 新增 UI 文案使用中文；界面按最小宽度 1024px 的桌面端设计，不做移动端适配。
- **页面地址只允许一层。** 在 `base: './'` 下 `/configurator/`、`/configurator/xxx` 这类更深的地址会把资源解析到 `/configurator/assets/…` 而 404 白屏；GitHub Pages 没有 rewrite，只能靠 `404.html` 副本兜底单层路径。要加嵌套路由先改 `base` 并复核部署，取舍见 [生成向导设计](docs/superpowers/specs/2026-11-19-configurator-design.md) 的「待处理」。
- **先写测试再改行为。** `src/lib/` 是纯函数，必须有 Vitest 单测；解析、密码、导出、diff 的边界先补能复现的测试。能表达成 Lint/类型约束的纠正优先做成确定性检查，而不是往文档加自然语言规则；反复被误用的 API 改签名让误用编译不过。安全与往返不变量由 `tests/*.property.test.ts` 的性质测试覆盖，生成器在 [tests/arbitraries.ts](tests/arbitraries.ts)。

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
npm run check       # lint + format:check + typecheck + test
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

每个事实只有一个归属层级；其他位置链接过去，不复制。

| 层级                                                                         | 职责                                                                                                | 不放                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 根 `AGENTS.md`（本文件）                                                     | 常驻工程规则：底线约束、目录、命令、改动流程、文档规则                                              | 产品用法、设计细节、任务清单             |
| [README.md](README.md)                                                       | 仓库入口：一句话介绍、线上地址、界面截图、快速开始、文档索引                                        | 详细用法、实现细节、评审记录、未做的计划 |
| [docs/usage.md](docs/usage.md)、[docs/configurator.md](docs/configurator.md) | 面向用户的详细用法：体检、对比、导出、密码占位、生成向导                                            | 工程规则、实现细节、任务清单             |
| `docs/engineering/`                                                          | 工程规范与门禁、本地开发与验证、数据管线的现状                                                      | 产品用法、任务清单                       |
| `docs/superpowers/specs/`                                                    | 一份设计的现状与取舍：日期、状态、目标、非目标、已选方案                                            | 逐步实现步骤                             |
| `docs/superpowers/plans/`                                                    | 一份执行时的原始计划：Goal、Architecture、Global Constraints、任务与 checkbox；完成后在文件头标状态 | 当前行为（以 spec 的现状为准）           |
| [types.ts](src/types.ts)、测试                                               | 当前契约与行为可执行的事实                                                                          | 历史、计划、评审叙述                     |

写作规则：

- **描述当前状态。** 历史留在 git；未做的内容留在 spec 的「非目标」或 plan 里，不写进 README。
- **一个事实只写一次。** 发现重复规则时保留一处，其余改为链接。
- **不手抄生成内容。** 配置项清单、版本表、测试清单以生成物或测试为准。
- **不写实现流水账和评审对话。** 只保留结论、约束、失败模式和验证方式。
- **设计必须带取舍。** spec 的「已选方案」要列出被放弃的方案和原因。
- **状态只用三种：** `待评审` / `已实现` / `已废弃`。实现完成时改状态，不补写实现过程；废弃时保留原因。
- **计划是执行记录。** 完成后只在计划文件头标 `状态：已实现`，不回头勾选或改写正文；计划里被后续改动覆盖的做法（脚本后缀、路由方案、触发方式）在状态行注明已被什么替换。当前行为以所属 spec 的现状章节为准。
- **文档与代码同一次改动更新。** 行为变更要么更新所属 spec，要么明确属于无需设计记录的 bug 修复。

## 维护本文件

本文件只保留每次会话都需要的规则；能放到具体文档的细节，放到那里并链接。新增规则时优先改现有条目，不追加同义规则。规则应与代码或脚本可核对；发现规则与现状不符时，先修正事实，再改规则。
