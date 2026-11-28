# PR 正文门禁设计

日期：2026-11-28
状态：已实现
范围：在 `.github/workflows/ci.yml` 的 `check` job 中校验 PR 正文。要求 `## 背景`、`## 改动`、`## 验证`、`## 备注` 四个二级标题齐全且顺序一致，「验证」在去除 HTML 注释与空白后非空。不改产品代码、不改 `pr:merge`、不改分支保护设置。

## 1. 意图：为什么做

[PR 模板](../../../.github/pull_request_template.md) 只在网页新建 PR 时自动预填；agent 常用 `gh pr create --body` 或 `--fill`，会完全绕过模板。dsh 把正文要求放进 skill 并由 AGENTS.md 强制引用，机器只校验 Issue 引用；我们单人维护、没有评审者兜底，纯约定无法阻止 agent 跳过正文结构，因此需要一条可失败的检查。

## 2. 现状

- `.github/pull_request_template.md` 提供「背景 / 改动 / 验证 / 备注」四段；网页创建 PR 时自动预填。
- `.github/workflows/ci.yml` 在 push 与 pull_request 上跑 `npm run check`、`npm run build`、`npm run smoke`；`check` 是 ruleset「Protect master CI」要求的必过检查。
- PR 正文没有任何机器校验：agent 用 `gh pr create --body` 或 `--fill` 时模板不生效，CI 与 `pr:merge` 都不读正文。

## 3. 目标与非目标

目标：

- pull_request 事件中，`check` job 校验正文含四个二级标题、顺序与模板一致，且「验证」小节在去除 HTML 注释与空白后仍有内容。
- 校验失败让 `check` 变红，GitHub auto-merge 不会合并。
- 修改 PR 正文后能重新校验：workflow 增加 `edited` 触发。

非目标：

- 不判断正文内容的真实性与质量，例如命令是否真的执行过。
- 不限制四个标题之外的自定义小节；允许额外内容。
- 不新增 workflow、job 或 required check；不改仓库 ruleset。
- 不在本地 `npm run check` 中运行：正文只在 PR 上下文存在。

## 4. 已选方案

- `scripts/lib/pr-body.ts`：纯函数 `validatePrBody(body)` 返回错误列表。先剥 HTML 注释，按行扫描二级标题并忽略 fenced code block 内的标题；「验证」的范围到下一个二级标题，去空白后为空即报错。
- `scripts/check-pr-body.ts`：从 `PR_BODY` 环境变量读正文；校验失败打印缺项并以 1 退出；缺少环境变量以 2 退出，避免本地误跑。
- `.github/workflows/ci.yml`：`pull_request.types` 增加 `edited`；`check` job 在 `setup-node` 之后、`npm ci` 之前运行校验。正文经环境变量传入，不拼进 shell 命令。代价是编辑标题或正文会重跑整套 CI（含冒烟）；单人仓库改动频率低，换取必过检查在未跑测试时不会假绿。
- 单测覆盖：完整正文、缺段、乱序、重复标题、验证仅注释或空白、代码块中的标题、CRLF、空正文。

放弃的方案：

- **只在 `pr:merge` 里校验**：能读到最新正文，但反馈在合并时，网页合并可绕过，并且会加厚已定为薄封装的合并入口。
- **独立 workflow + 新的 required check**：编辑正文只跑轻量检查，但要同步修改仓库 ruleset 才能阻断；本次不改共享设置。
- **CI 加 `edited` 但跳过重活**：job 级跳过会让必过的 `check` 在未跑测试的情况下报绿，破坏门禁诚信；宁可重跑整套 CI。
- **只靠 AGENTS.md 与模板注释约束**：dsh 有评审兜底，我们没有，约定无法阻止绕过。

## 5. 验收

- `npx vitest run tests/prBody.test.ts` 覆盖上述边界。
- 空正文或删掉「验证」内容的 PR 上 `check` 红；补全正文后 `edited` 触发重跑并转绿。
- `npm run check` 与 `npm run build` 通过。
