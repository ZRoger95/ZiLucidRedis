# 外环首期：只报告型定时模糊测试设计

日期：2026-11-25
状态：已实现
范围：为现有四组安全/健壮性不变量（无明文泄漏、两级还原、跨模块一致性、解析健壮性/幂等）建立 GitHub Actions 定时放大的模糊测试，失败只产报告。不扩生成器覆盖面，不改产品代码，不碰 `ci.yml` / `deploy.yml` 门禁与部署链路。

## 意图：为什么做

[性质测试 spec](2026-11-23-property-testing-design.md) 把四组不变量固化成了 fast-check 性质，但内环受「秒级时长」约束，每条性质只有 100–500 轮，探索的是输入空间的浅层。[运行时验证 spec](2026-11-24-runtime-verification-design.md) 的「缓行项优先级」允许「只报告型定时模糊」在 CI 冒烟落地后先行：CI 内环已长期绿（check → build → smoke 门禁在 push master / PR 上运行），前置条件满足。外环用每周定时任务把轮数放大一个数量级、每次换新 seed，把深层组合空间交给时间；失败只产报告（seed + 收缩后最小反例 + 违反的不变量），不自动改代码、不自动合并——自动合并仍需误报率与回滚率的长期证据，排在最后。

## 目标与边界

目标：

- 触发：新增 `.github/workflows/fuzz.yml`，`schedule: cron '0 19 * * 6'`（UTC 周六 19:00 = 北京时间每周日凌晨 3 点）+ `workflow_dispatch`（可输入 seed 与倍数，便于手动验证与重放）。
- 范围：只跑现有五个 `tests/*.property.test.ts`（覆盖四组不变量），不新增生成器与性质。
- 轮数放大：环境变量 `FUZZ_RUNS_MULTIPLIER`（正整数，默认外环 20、内环 1）乘在每条性质现有 `numRuns` 上；`FUZZ_SEED`（非负整数）固定 fast-check 全局 seed。两者未设置时性质测试行为与现状完全一致，`npm run check` 的确定性与秒级时长不受影响。单条性质耗时随轮数线性增长，fuzz 运行时 Vitest `--testTimeout` 同步放大为 `5000ms × 倍数`，避免默认 5s 超时把慢性质误报为失败（本地 ×20 实测最长单测约 12s）。
- 每次运行随机 seed 且记录可重放：`npm run fuzz`（`scripts/run-fuzz.ts`）在未指定 `FUZZ_SEED` 时用 `node:crypto` 生成随机 seed，注入子进程并写进报告；重放 = 相同 seed + 相同倍数。
- 失败只产报告：Vitest json reporter 输出 + `scripts/fuzz-report.ts` 生成 `.fuzz/report.md`（时间、seed、倍数、通过/失败统计、每条失败的测试名与 fast-check 失败原文——含收缩后最小反例与 path、bash/PowerShell 重放命令）。workflow 把报告写入 Step Summary 并以 `if: always()` 上传 `.fuzz/` artifact；job 退出码跟随测试结果（红 = 有发现），但不构成任何合并/部署门禁。
- 新增纯函数（参数解析、报告生成）有 Vitest 单测；运行时依赖零新增。

非目标：

- 不扩生成器覆盖面、不新增不变量；发现新接缝按性质测试 spec 的流程另行处理。
- 不自动改代码、不自动建 PR/issue、不自动合并；`permissions: contents: read`。
- 不改 `ci.yml` / `deploy.yml`、不改 `npm run check` 组成、不改产品代码与 `src/lib/`。
- 不做失败自动归因与去重；报告保留 fast-check 原文，人工研判。

## 方案

已选：**复用现有性质测试 + 环境变量参数化 + 独立 workflow**。`tests/fuzz-params.ts` 导出 `fuzzRuns(base)`（读 `FUZZ_RUNS_MULTIPLIER`，默认 1）并在 `FUZZ_SEED` 存在时 `fc.configureGlobal({ seed })`；五个性质测试文件的 `numRuns: N` 改为 `numRuns: fuzzRuns(N)`，env 未设置时数值不变。`scripts/run-fuzz.ts` 解析/生成 seed 与倍数，用 `process.execPath` 直启 Vitest（`vitest run property`，文件名过滤精确选中五个性质文件），default + json 双 reporter；跑完读 json 生成 markdown 报告，退出码透传。纯函数 `resolveFuzzParams`（参数解析）与 `buildFuzzReport`（报告生成）可单测。

放弃的方案：

- **独立模糊脚本（Vitest 之外重写断言）**：四组不变量出现第二份实现，与性质测试漂移；性质 spec 已因同样理由放弃过独立脚本。
- **大轮数直接进内环 `npm test`**：破坏秒级门禁，所有贡献者每次 check 都付外环成本。
- **只靠 `fc.configureGlobal({ numRuns })` 放大**：调用点显式 `numRuns` 优先于全局配置，放大不生效；必须改调用点为 `fuzzRuns(N)`，同时这保证了默认行为逐值不变。
- **独立 `vitest.fuzz.config.ts`**：CLI 过滤 `vitest run property` 已能精确选中五个文件；第二份配置要与主配置同步 setup/pool/exclude，漂移风险大于收益。
- **失败自动建 issue / 自动修复 / 自动合并**：误报率与回滚率证据不足，首期只报告；自动合并仍按缓行项优先级排最后。
- **逐性质记录独立 seed + path 重放**：fast-check 失败原文已含 seed/path；统一 seed + 倍数即可整体重放，无需逐项登记。

已知取舍：

- 固定 seed 下，使用同一生成器的不同性质共享同一输入序列（覆盖相关）；换取单参数整体重放，接受。
- 重放必须同时固定 seed 与倍数（轮数决定执行序列长度），报告两者都记录。
- GitHub schedule 只在默认分支生效：分支推送后先用 `workflow_dispatch` 手动验证，合入 master 后定时自动生效。
- 报告产物目录 `.fuzz/` 进 `.gitignore` 与 ESLint ignores，与 `.screenshots/` 同类。

## 验收标准

- `npm run check` 与 `npm run build` 通过；env 未设置时五个性质文件的 `numRuns` 与现状逐值相同。
- 本地 `npm run fuzz` 产出 `.fuzz/report.md` 与 `.fuzz/vitest-report.json`，报告含 seed、倍数、统计与重放命令；相同 seed + 倍数两次运行结果一致（可重放）。
- `fuzz.yml`：cron `0 19 * * 6` + `workflow_dispatch`（seed/倍数输入），`contents: read`，报告进 Step Summary 与 artifact；`ci.yml` / `deploy.yml` 零改动。
- `resolveFuzzParams` 与 `buildFuzzReport` 有单测（默认值、非法输入、seed=0、失败报告含反例原文）。
- 运行时依赖零新增。
