# AGENTS.md 体量预算设计

日期：2026-11-28
状态：已实现
范围：给根 `AGENTS.md` 设非空白字符上限（4,550），由 `scripts/check-doc-budget.ts` 在 `npm run check` 中校验；同时把文档治理与底线约束的解释性内容迁到 `docs/engineering/`，根文件只留规则。不改其他文档的预算、不改 CI workflow、不改合并入口。

## 1. 意图：为什么做

- 根 AGENTS.md 每个会话都会加载，是固定的上下文成本；agent 每加一条规则都会直接增加这份成本。
- dsh 用 `verify-doc-budgets` 给常驻文档设词数上限，要求低于目标时保留至少 5% 余量、上调在 PR 说明理由。这套思路适用，但 `wc -w` 对中文按空格分词没有意义。
- 本文件在 2026-11-17 到 2026-11-28 间从 3,722 涨到 5,968 个非空白字符；没有护栏时增长不可见。

## 2. 现状

- 根 AGENTS.md 压缩后 4,303 个非空白字符（压缩前 6,070）；规则本身留在根文件，归属表、写作规则与 how/why 已迁到 `docs/engineering/`。
- `npm run check` 已覆盖 lint、格式、类型与测试，本次追加文档体量检查。
- 其他文档（README、docs/、spec/plan）不是每个会话加载，不在预算范围。

## 3. 目标与非目标

目标：

- AGENTS.md 非空白字符不超过 4,550；超出时 `npm run check` 失败，CI 与 deploy 都继承。
- 失败信息给出当前值、上限、超出量和处理方式；通过时打印当前值与上限，余量可见。
- 规则写进 AGENTS.md 的「维护本文件」，上限数字只存在于脚本。

非目标：

- 不预算 README、docs/、spec/plan，也不做多文件 manifest。
- 不新增 CI job，不挂 pre-commit hook。
- 不自动强制下调；删减后按规则人工把上限压回基线 +5%（向上取整到 50）。
- 不判断规则内容质量，只量体量。

## 4. 已选方案

- 计数：code point 非空白字符，`[...source].filter((char) => !/\s/u.test(char)).length`。不受 Prettier 表格对齐影响，中文按字计，emoji 算 1。
- 上限 4,550：压缩后基线 4,303，余量 247（5.7%），约 2 条普通规则；沿用 dsh 的 5% 口径。
- 压缩：文档治理的归属表与写作规则迁到 [documentation.md](../../engineering/documentation.md)；生成数据清单迁到 [data-pipeline.md](../../engineering/data-pipeline.md)；页面机制与测试细节迁到 [development.md](../../engineering/development.md) 与所属 spec。根文件保留「禁止/必须 + 失败后果」与链接，已被 lint/脚本强制的规则缩到一句。
- `scripts/check-doc-budget.ts`：`DOC_BUDGETS` 持有上限，`countBudgetChars` / `measureDocBudget` 为纯函数；文件缺失或超限时退出 1。
- `tests/docBudget.test.ts`：覆盖空白与表格对齐、code point、边界与预算表合法性。
- `package.json`：新增 `check:docs`，追加到 `npm run check`；`npm run build` 不重复跑。
- AGENTS.md：命令块注释补「文档预算」；「维护本文件」增加体量规则，不重复上限数字。
- 触发后的处理：先改现有条目或把细节迁移到 `docs/engineering/`；确需上调时在 PR 备注说明理由并同步修改常量；删减后同步下调。

放弃的方案：

- **`wc -w` 词数**：中文按空格分词失真，dsh 的英文口径不能直接复用。
- **全部字符 / 行数**：全部字符会被 Prettier 表格对齐放大；行数对表格和长段落不可比。
- **不压缩直接设 6,400**：当时基线 6,070，余量约 330，但根文件仍背着归属表与大量解释；先压缩到 4,303 再把上限降到 4,550，约束更实在。
- **压缩过头只留口号**：密码、页面地址、生成数据这类非强制约束会失去可执行性；保留失败后果与关键词，只移机制和清单。
- **多文件 manifest / `--list`**：当前只有一份常驻文档，YAGNI。
- **仅 Vitest 测试**：没有独立命令和清晰的失败输出；文档门禁不应混进测试计数。
- **并入 `npm run lint`**：`build` 也会拦，但 lint 的语义会扩大到文档体量；`check` 已是完成前门禁。
- **pre-commit hook**：dsh 也不在 hook 里跑 doc budgets；hook 保持快。

## 5. 验收

- `npm run check` 通过，输出 `AGENTS.md: 4303 / 4550 非空白字符`。
- `npx vitest run tests/docBudget.test.ts` 通过。
- 临时把 `DOC_BUDGETS` 调低时 `npm run check:docs` 退出 1 并报出超出量；恢复后退出 0。
- `npm run build` 通过。
