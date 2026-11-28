# PR 合并入口 Implementation Plan

状态：已实现（2026-11-28 合并等待改为 GitHub auto-merge 薄封装，标题与正文改用默认 squash 消息，见 [spec](../specs/2026-11-27-pr-merge-entry-design.md)）

**Goal:** 提供一个本地合并入口 `npm run pr:merge -- <PR号>`，先等该 PR 的检查全部通过，再以 squash 合并，并保证合并提交标题为 `<PR 标题> (#<PR号>)`、正文为该 PR 的提交清单。

**Architecture:** 纯逻辑与命令编排分离。`scripts/lib/pr-merge.ts` 只放可单测的纯函数（标题拼接、正文拼接、参数解析、检查状态归约）；`scripts/pr-merge.ts` 负责预检 `gh`、读 PR 元数据、轮询 `statusCheckRollup`、调用 `gh pr merge`。所有外部命令经一个可注入的执行器，使「检查失败不得合并」「特殊字符原样传递」能在单测里断言。

**Tech Stack:** Node 24 原生 TypeScript（`node --experimental-strip-types`）、GitHub CLI（`gh` ≥ 2.20.0）、Vitest。不新增依赖。

## Global Constraints

- 不改产品代码：`src/` 一律不动；只新增 `scripts/lib/pr-merge.ts`、`scripts/pr-merge.ts`、`tests/prMerge.test.ts`，以及 `package.json` 一行 script。
- 不加运行时依赖；不引入 Octokit 等 GitHub 客户端，全部走 `gh`。
- 脚本默认不删除任何分支，不提供删除开关；不重试失败检查；不提供 `--admin`；**不提供跳过检查的开关**（无 `--now`）。
- 跨平台硬约束（macOS + Windows）：调用 `gh` 一律 `spawn` / `execFile` + 参数数组 + `shell: false`；不拼接命令字符串、不依赖 shell 语法；路径用 `node:path`；npm script 保持单条 `node …` 命令。
- 不改写已发布历史；不创建 git 提交、不推送，除非任务另行明确。
- ESLint 覆盖 `scripts/`：`npm run check` 必须零告警；源码注释规则按仓库既有口径执行。
- 行为变更前先写失败测试：纯函数与编排逻辑都先 RED 再实现。

## Task 1：纯函数与单测

**Files:** `scripts/lib/pr-merge.ts`、`tests/prMerge.test.ts`

1. 先写测试（RED）：
   - `squashSubject('feat: x', 6)` → `feat: x (#6)`
   - `squashSubject('feat: x (#6)', 6)` → `feat: x (#6)`（不重复）
   - `squashSubject('feat: x (#12)', 6)` → `feat: x (#12) (#6)`（不改正文引用）
   - `squashSubject` 对含引号、括号、中文、emoji 的标题原样保留，只追加后缀
   - `squashBody([{ headline: 'feat: a' }, { headline: 'test: b' }])` → `* feat: a\n* test: b`；空列表 → `''`
   - `parseArgs([])` → 错误「缺少 PR 号」；`parseArgs(['abc'])` → 错误「PR 号必须是正整数」
   - `parseArgs(['6'])` → `{ prNumber: 6 }`；`parseArgs(['6', '--now'])` → 错误「未识别参数」；`parseArgs(['6', '--delete-branch'])` → 错误「未识别参数」
   - `summarizeChecks`：`CheckRun` 全 `SUCCESS` → `pass`；含 `FAILURE` → `fail`；`conclusion: null` → `pending`；`StatusContext` 的 `SUCCESS` → `pass`、`ERROR` → `fail`、`PENDING` → `pending`；空列表 → `pending`
2. 实现到 GREEN，`npx vitest run tests/prMerge.test.ts` 通过。

## Task 2：CLI 编排与可注入执行器

**Files:** `scripts/pr-merge.ts`、`tests/prMerge.test.ts`

1. 先写编排测试（RED），用假的执行器记录调用序列与参数数组：
   - 检查失败时：调用过 `pr view`，**没有**调用 `pr merge`，返回非 0。
   - 检查全绿时：调用 `pr merge <n> --squash --subject <值> --body <值>`；`--subject` 与 `squashSubject` 一致，`--body` 与提交清单一致。
   - 标题含引号、括号、中文、emoji 时，执行器收到的参数数组中该值完整原样。
   - PR 已是 `MERGED`：返回 0，不调用合并。
   - base 非 `master`：返回非 0，不调用合并。
   - PR 不存在（`gh` 报错）：返回非 0，错误信息透传。
2. 实现 `scripts/pr-merge.ts`：
   - 预检 `gh auth status`；解析 `gh --version` 并校验 ≥ 2.20.0，不满足直接报错退出。
   - 读 `gh pr view <n> --json state,title,baseRefName,statusCheckRollup,commits`。
   - 每 15 秒轮询检查状态，最多 15 分钟；每次状态变化打印一行。
   - 合并后打印合并提交号与后续命令提示（不代为执行本地分支操作）。
3. 脚本入口用 `main()` + `process.exitCode`，避免顶层副作用影响测试导入。

## Task 3：npm script 与真实试跑

**Files:** `package.json`

1. 增加 `"pr:merge": "node --experimental-strip-types scripts/pr-merge.ts"`。
2. 无副作用的真实试跑，逐条记录实际输出与所在平台（Windows `client:…` / macOS）：
   - `npm run pr:merge`（无参数）→ 用法 + 非 0
   - `npm run pr:merge -- abc` → 非法参数 + 非 0
   - `npm run pr:merge -- 6 --now` → 「未识别参数」+ 非 0
   - `npm run pr:merge -- 999999` → PR 不存在，`gh` 原始错误透传
   - `npm run pr:merge -- 5` → PR #5 已 `MERGED`：退出 0、零合并调用（`#1`–`#5` 全为已合并，可直接验证幂等）
3. CI 不执行此脚本；另一个平台至少手动跑一次上面前两条无副作用用例并记录结果。
4. 不执行任何真实合并作为验证手段。

## Task 4：文档状态与全量验证

1. 本 spec 状态改「已实现」，本计划文件头改「状态：已实现」。
2. 跑 `npm run check`、`npm run build`，记录真实结果。
3. 不新增 `AGENTS.md` 条目：这是工具保证的行为，不是常驻工程规则（见 spec §5 方案 B）。

## Review Focus

- 标题与正文都是「只补不改」：不得裁剪或改写 PR 标题与提交首行里的其他内容。
- 检查判定是否保守：未完成一律 pending；`CheckRun` 与 `StatusContext` 两种条目都覆盖，不依赖「本仓库只有 Actions」的隐含假设。
- 失败路径是否零副作用：任何非 0 退出前都不得调用 `gh pr merge`。
- 是否引入平台耦合：只允许 `spawn`/`execFile` + 参数数组 + `shell: false`，不出现命令字符串拼接。
- 是否误伤既有流程：`package.json` 只加一行，不动 `check` / `lint` / `smoke` 组成。
