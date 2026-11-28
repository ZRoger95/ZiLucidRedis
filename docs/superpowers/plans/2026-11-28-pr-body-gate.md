# PR 正文门禁 Implementation Plan

状态：已实现

**Goal:** PR 正文缺段或「验证」为空时，CI 的 `check` 必过检查变红，auto-merge 无法合并。

**Architecture:** 纯逻辑与 CI 编排分离。`scripts/lib/pr-body.ts` 只放可单测的 `validatePrBody`；`scripts/check-pr-body.ts` 读取 `PR_BODY` 环境变量并输出错误；`.github/workflows/ci.yml` 负责在 pull_request 事件中调用，正文不拼接进 shell。

**Tech Stack:** Node 24 原生 TypeScript（`node --experimental-strip-types`）、Vitest、GitHub Actions。不新增依赖。

## Global Constraints

- 不改 `src/`、`scripts/pr-merge`、分支保护 ruleset。
- 校验逻辑先写失败测试再实现。
- PR 正文一律经环境变量传入，不生成临时脚本、不拼接 shell 命令。
- 四个标题与模板保持一致；模板或标题变更必须同步校验器与测试。
- 完成前运行 `npm run check` 与 `npm run build`。

## Task 1：纯函数与单测

**Files:** `scripts/lib/pr-body.ts`、`tests/prBody.test.ts`

1. 先写测试（RED）：完整正文通过；缺段、乱序、重复标题报错；「验证」只有 HTML 注释或空白时报错；代码块内的 `##` 不算标题；CRLF 与空正文有确定结果。
2. 实现 `validatePrBody` 到 GREEN，`npx vitest run tests/prBody.test.ts` 通过。

## Task 2：CLI 与 CI 接入

**Files:** `scripts/check-pr-body.ts`、`.github/workflows/ci.yml`

1. CLI 读取 `PR_BODY`：缺失退出 2，校验失败逐条打印并退出 1，通过打印成功信息。
2. ci.yml 的 `pull_request` 增加 `edited` 触发；`check` job 在 `setup-node` 后运行校验，正文经 `env` 传入。

## Task 3：模板与文档同步

**Files:** `.github/pull_request_template.md`、`AGENTS.md`、`docs/engineering/development.md`、`docs/superpowers/specs/2026-11-24-ci-smoke-design.md`

1. 模板顶部注释注明 CI 校验；「备注」占位由「没有就删掉本节」改为「没有就写无」，避免与门禁冲突。
2. AGENTS.md 的 PR 正文规则注明 CI 校验范围。
3. development.md 与 ci-smoke spec 的现状同步这条检查。
