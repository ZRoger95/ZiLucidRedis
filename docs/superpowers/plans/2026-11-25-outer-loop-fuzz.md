# 外环首期只报告型定时模糊实施计划

状态：已实现（本地验证：check/build 绿；×20 随机 seed 全绿 37.5s；同 seed 同倍数重放结果一致；必失败性质端到端验证报告含收缩反例与退出码 1。验证中发现默认 5s testTimeout 在放大后误报超时，已改为随倍数线性放大。schedule 需合入默认分支后生效，分支上先用 workflow_dispatch 验证）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每周日北京时间凌晨 3 点在 GitHub Actions 上放大轮数跑现有四组不变量的性质测试，随机 seed 可重放，失败只产报告，不碰内环门禁与部署链路。

**Architecture:** `tests/fuzz-params.ts` 用环境变量参数化现有五个性质测试的 `numRuns` 与全局 seed（未设置时行为逐值不变）；`scripts/run-fuzz.ts` 生成/解析 seed 与倍数、直启 Vitest（`vitest run property` + default/json 双 reporter）、调用 `scripts/fuzz-report.ts` 的纯函数生成 `.fuzz/report.md`；`.github/workflows/fuzz.yml` 定时/手动触发，报告进 Step Summary 与 artifact。

**Tech Stack:** fast-check（已有）、Vitest json reporter（已有）、Node 原生 TypeScript 脚本、GitHub Actions schedule。

**Spec:** `docs/superpowers/specs/2026-11-25-outer-loop-fuzz-design.md`

## Global Constraints

- 不改产品代码、`src/lib/`、生成器与性质断言本身；只把 `numRuns: N` 换成 `numRuns: fuzzRuns(N)`。
- 不改 `ci.yml` / `deploy.yml` / `npm run check` 组成；运行时依赖零新增。
- env 未设置时内环行为与现状完全一致（numRuns 逐值相同、seed 仍走 fast-check 默认）。
- 失败只产报告：workflow `permissions: contents: read`，不建 issue/PR、不改代码。
- 新纯函数先有单测；`npm run check` 与 `npm run build` 必须通过。
- 在新分支上提交（Conventional Commits，走 Husky 门禁），完成后推送 origin；不合并。

## Review Focus

- `fuzzRuns` 默认倍数为 1，五个性质文件改动的唯一差异是 numRuns 包了一层。
- `FUZZ_SEED` 允许 0；空字符串（schedule 触发时 inputs 为空）按未设置处理。
- run-fuzz 用 `process.execPath` 直启 Vitest 入口，避免 Windows 下 npx/.cmd 的 shell 依赖。
- 报告必须含 seed、倍数、失败原文（收缩反例 + path）与重放命令；成功也记录 seed。
- workflow cron `0 19 * * 6`；artifact `if: always()` 且 `include-hidden-files: true`（`.fuzz` 是隐藏目录）。

---

### Task 1: 参数助手与性质测试接线

**Files:**

- Create: `scripts/fuzz-params.ts`（纯函数 `resolveFuzzParams`，供编排脚本复用）
- Create: `tests/fuzz-params.ts`（re-export `resolveFuzzParams` + fast-check 接线）
- Create: `tests/fuzzParams.test.ts`
- Modify: `tests/secrets.property.test.ts`、`tests/persistence.property.test.ts`、`tests/parseConf.property.test.ts`、`tests/exportConf.property.test.ts`、`tests/normalizeConf.property.test.ts`

**Interfaces:**

- `resolveFuzzParams(rawMultiplier, rawSeed): { multiplier: number; seed: number | undefined }`：multiplier 默认 1、须 ≥1 整数；seed 须 ≥0 整数；空串按未设置；非法值抛错。
- 模块加载时若 seed 存在则 `fc.configureGlobal({ seed })`；`fuzzRuns(base) = base * multiplier`。
- 单测先行：默认值、合法值、seed=0、空串、非法值抛错。

- [ ] **Step 1:** 写 `tests/fuzzParams.test.ts` 再实现 `tests/fuzz-params.ts`。
- [ ] **Step 2:** 五个性质文件 `numRuns` 全部改为 `fuzzRuns(N)`，跑 `npm test` 确认绿。

### Task 2: 报告生成与编排脚本

**Files:**

- Create: `scripts/fuzz-report.ts`（纯函数 `buildFuzzReport`）
- Create: `tests/fuzzReport.test.ts`
- Create: `scripts/run-fuzz.ts`
- Modify: `package.json`（`"fuzz": "node --experimental-strip-types scripts/run-fuzz.ts"`）

**Interfaces:**

- `buildFuzzReport({ seed, multiplier, generatedAt, report })`：输入 Vitest json 报告的最小类型面，输出 markdown（统计、失败原文、bash/PowerShell 重放命令）。
- run-fuzz：seed = `FUZZ_SEED` ?? `randomInt(2**31)`；倍数 = `FUZZ_MULTIPLIER` ?? 20；spawn Vitest（filter `property`，`--reporter=default --reporter=json --outputFile.json=.fuzz/vitest-report.json`，`--testTimeout=5000×倍数` 防止放大后超时误报）；写 `.fuzz/report.md`；退出码透传。

- [ ] **Step 1:** 写 `tests/fuzzReport.test.ts` 再实现 `scripts/fuzz-report.ts`。
- [ ] **Step 2:** 实现 `scripts/run-fuzz.ts` 与 npm 脚本；本地小倍数跑通并验证同 seed 重放一致。

### Task 3: workflow 与忽略清单

**Files:**

- Create: `.github/workflows/fuzz.yml`
- Modify: `.gitignore`（`.fuzz`）、`eslint.config.ts`（globalIgnores 加 `.fuzz/**`）

**Interfaces:**

- `schedule: '0 19 * * 6'` + `workflow_dispatch`（seed/multiplier 字符串输入，留空走默认）；`permissions: contents: read`；Node 24 + npm ci；`npm run fuzz`；`if: always()` 把 report.md 追加进 `$GITHUB_STEP_SUMMARY` 并上传 `.fuzz/`（include-hidden-files）。

- [ ] **Step 1:** 写 fuzz.yml，action 版本与 ci.yml 对齐；核对不触碰 ci.yml/deploy.yml。

### Task 4: 验证与文档收尾

**Files:**

- Modify: 本 spec 状态、`docs/superpowers/specs/2026-11-24-runtime-verification-design.md`（缓行项现状）、`docs/superpowers/specs/2026-11-23-property-testing-design.md`（外环链接）、`README.md`（npm run fuzz 一行）

- [ ] **Step 1:** `npm run check`、`npm run build`；`FUZZ_MULTIPLIER=2 npm run fuzz` 产报告；固定 seed 两次运行结果一致。
- [ ] **Step 2:** spec 标「已实现」，本计划文件头标状态；更新缓行项现状与 README。
- [ ] **Step 3:** 新分支提交并推送 origin；注明 schedule 需合入默认分支后生效，分支上先用 workflow_dispatch 验证。
