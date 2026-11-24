# 核心纯函数属性测试实施计划

状态：已实现

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 fast-check 把「密码不落盘、还原正确、跨模块一致、解析健壮」四组不变量变成可执行事实，并固化「纠正 → 确定性检查」流程规则。

**Architecture:** 在现有 Vitest 体系内新增性质测试文件（`tests/*.property.test.ts`），共享一个植入式生成器模块（`tests/arbitraries.ts`）。生成器构造输入时记录植入明文，性质同时验证替换完整性与正确性。性质暴露的真实缺陷按修 bug 流程最小修复并留回归测试；契约模糊处用两级不变量（规范形态字节级 / 任意形态语义级）固定现状，不改行为。

**Tech Stack:** TypeScript strict、Vitest 5、fast-check（仅 devDependency）。

**Spec:** `docs/superpowers/specs/2026-11-23-property-testing-design.md`

## Global Constraints

- fast-check 只进 devDependencies；运行时依赖零新增，运行时零外部请求不变。
- 不改变产品行为；唯一例外是性质测试暴露的真实缺陷，按修 bug 流程最小修复 + 回归测试，并同步 spec 现状描述。
- 不改变 `replaceSecrets` 的空白归一化行为；不改 CI 与部署配置。
- 测试遵循现有风格：TS strict 无 `any`，不新增解释性注释。
- 每条性质默认 `numRuns: 100`，安全关键性质 500；失败必须可 seed 重放；全部性质测试时长增量控制在秒级。
- 完成前运行 `npm run check` 和 `npm run build`。

## Review Focus

- **占位符混排错位（疑点）**：输入同时含字面 `${env_*}` 与真实密码时，`restoreSecrets` 的计数与 `replaceSecrets` 的 vault 登记是否对齐；`exportWithSecrets` 继承同一路径。
- **引号占位符守卫误判（疑点）**：`requirepass "${env_requirepass}"` 这类用户可编辑形态是否被 `saveState` 误拒。
- **替换完整性**：性质断言针对生成器植入的全部明文，而非仅 vault 内容；漏抓即失败。
- **两级往返契约**：字节级只对规范形态断言；语义级以 `parseConf` 结果等价为准，不得借「语义等价」放过真实丢值。
- **时间预算**：性质测试总增量秒级，超预算先降 `numRuns` 并记录，不得删性质。

---

### Task 1: 引入 fast-check 与生成器基建

**Files:**

- Modify: `package.json`
- Create: `tests/arbitraries.ts`

**Interfaces:**

- `confWithSecretsArb`：生成 `{ text, planted }`，text 为含敏感行的 conf 文本，planted 为植入的明文集合；覆盖四类敏感指令、`user` 行多密码、引号/转义/空白（空格与 tab）/CRLF/行内 `#` 片段变体，以及规范形态子生成器（单空格、LF、末尾换行）。
- `mutatedConfArb`：读取 `src/data/official/*.conf`，随机增删行、截断、替换字符，产出任意形态文本。
- 生成器自检性质：planted 中每个明文确实出现在 text 中，且 text 至少含一条敏感指令。

- [ ] **Step 1: 安装 fast-check 到 devDependencies**，确认 `package.json` 与锁文件更新。
- [ ] **Step 2: 实现两个生成器与自检性质**，先跑自检确认生成器本身可信。
- [ ] **Step 3: 运行 Vitest**，确认自检通过且耗时在预算内。

### Task 2: secrets 不变量

**Files:**

- Create: `tests/secrets.property.test.ts`
- Modify: `src/lib/secrets.ts`（仅当确认缺陷）
- Modify: `tests/secrets.test.ts`（仅追加回归例子）

**Interfaces:**

- 无明文泄漏：输出不含 planted 与 vault 中任何值；`found > 0` ⇒ `hasPlaceholder(输出)`。
- 幂等：对输出再次 `replaceSecrets`，`found === 0`。
- 字节级往返：规范形态输入满足 `restoreSecrets(replaceSecrets(t).text, vault) === t`。
- 语义级往返：任意形态输入，`parseConf` 后指令名与参数序列等价。
- 占位符混排：输入含字面 `${env_*}` 与真实密码时还原不错位（预期先失败，复现后定性）。

- [ ] **Step 1: 写全部性质**，安全性质 `numRuns: 500`。
- [ ] **Step 2: 运行并分流失败**：契约模糊 → 按两级不变量修正断言；真实缺陷 → 记录最小反例。
- [ ] **Step 3: 对确认的缺陷做最小修复**，把收缩后的最小反例固化为 `tests/secrets.test.ts` 回归例子，更新 spec 现状。
- [ ] **Step 4: 重跑性质与例子测试**，确认全绿。

### Task 3: persistence 跨模块一致性

**Files:**

- Create: `tests/persistence.property.test.ts`
- Modify: `src/lib/persistence.ts`（仅当确认缺陷）
- Modify: `tests/persistence.test.ts`（仅追加回归例子）

**Interfaces:**

- 对任意 text，`saveState({ ...base, text: replaceSecrets(text).text })` 不抛错。
- 持久化产物（`localStorage` 原始字符串）不含 planted 任何明文。
- 引号占位符形态：`saveState` 对 `requirepass "${env_requirepass}"` 的行为有明确结论（误拒则修复，否则用性质固定现状）。

- [ ] **Step 1: 写一致性性质**，复用 Task 1 生成器与 Task 2 结论。
- [ ] **Step 2: 运行并定性引号占位符接缝**，缺陷则最小修复 + 回归例子。
- [ ] **Step 3: 重跑**，确认守卫与替换器对全部生成输入一致。

### Task 4: 解析、导出与归一化健壮性

**Files:**

- Create: `tests/parseConf.property.test.ts`
- Create: `tests/exportConf.property.test.ts`
- Create: `tests/normalizeConf.property.test.ts`

**Interfaces:**

- `parseConf`：对任意字符串与 `mutatedConfArb` 输入不抛异常；`lineNo` 单调且与输入行数对应（结构断言以 `types.ts` 的 `ParsedLine` 为准）。
- `exportOriginal`：幂等；输出无 CRLF、无尾部空行、以单个换行结尾。
- `exportWithSecrets`：对 `replaceSecrets` 输出能语义还原（继承 Task 2 的还原结论）。
- `normalizeConfig`：幂等（第二遍 text 不变）；第二遍 `droppedComments === 0`；`unknown` 集合稳定。

- [ ] **Step 1: 写三组性质**，官方 conf 变异输入全部进入解析性质。
- [ ] **Step 2: 运行并分流失败**，真实缺陷按修 bug 流程处理并留回归。
- [ ] **Step 3: 重跑全量测试**，确认时长增量仍在秒级。

### Task 5: 流程规则与收尾

**Files:**

- Modify: `AGENTS.md`
- Modify: `docs/engineering/eslint.md`
- Modify: `docs/superpowers/specs/2026-11-23-property-testing-design.md`
- Modify: `docs/superpowers/plans/2026-11-23-property-testing.md`

- [ ] **Step 1: 修订 `AGENTS.md`「先写测试再改行为」条目**：能表达成 Lint/类型约束的纠正优先做成确定性检查；反复被误用的 API 改签名。改现有条目，不追加同义规则。
- [ ] **Step 2: 在 `docs/engineering/eslint.md`「维护」节补同一流程规则**，与 AGENTS.md 单一归属、互相链接不复制。
- [ ] **Step 3: 运行 `npm run check` 与 `npm run build`**，确认 lint、格式、类型、全部测试与构建通过。
- [ ] **Step 4: 将 spec 状态改为「已实现」并更新现状描述**，在本计划文件头标「状态：已实现」。