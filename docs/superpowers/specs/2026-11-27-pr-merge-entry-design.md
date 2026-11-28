# PR 合并入口：auto-merge 薄封装设计

日期：2026-11-27
修订：2026-11-28
状态：已实现
范围：本地合并入口 `npm run pr:merge -- <PR号>`。脚本只做参数与前提校验，合并动作交给 GitHub auto-merge；标题与正文使用 GitHub 默认 squash 消息。不改产品代码、不改 CI 工作流。

## 1. 意图：为什么做

2026-11-27 合并 PR #5 时，agent 用 `gh pr merge --squash --subject "…"` 指定了标题，`--subject` 整体覆盖了 GitHub 默认模板里的 `(#5)`，正文也被清空，`master` 上留下一条无法回溯 PR 的提交。为把「合并前等检查、标题带编号」从记忆变成入口，新增了 `npm run pr:merge`。

首版由脚本自己轮询 `statusCheckRollup` 并拼标题与正文。2026-11-28 在 PR #9 上，PR 刚创建、检查进行中时 GitHub 返回 `conclusion: ""`，首版把空字符串当成失败，合并入口误中止。这暴露出自维护状态机的维护成本：平台已经有 auto-merge 与必过检查，脚本不应重复实现等待。

## 2. 现状

- `master` 的 ruleset「Protect master CI」要求 `check` 状态检查与 PR，检查未通过无法合并；允许的合并方式已收窄为只有 squash。
- 仓库已开启 Allow auto-merge；squash 默认标题为「提交标题或 PR 标题」，正文为提交列表；GitHub 在默认标题后自动补 `(#<PR号>)`，PR #2、#3 已验证；PR #5 因覆盖 `--subject` 丢失。
- `npm run pr:merge -- <PR号>` 是唯一合并入口：只接受一个 PR 号；校验 PR 为 OPEN、base 为 `master` 后执行 `gh pr merge <PR号> --squash --auto`，再轮询 PR 状态直到 MERGED / CLOSED / 超时。不接受 `--subject`、`--body` 等任何其他参数。
- 纯逻辑在 [scripts/lib/pr-merge.ts](../../../scripts/lib/pr-merge.ts)，命令编排在 [scripts/pr-merge.ts](../../../scripts/pr-merge.ts)，单测在 [tests/prMerge.test.ts](../../../tests/prMerge.test.ts)。

## 3. 目标

- 一个入口，agent 无法通过参数覆盖标题与正文。
- 不在脚本里重造检查等待：等检查由 GitHub auto-merge 基于必过检查完成。
- 合并标题为 GitHub 默认 squash 标题（自带 `(#N)`），正文为默认提交列表。
- 异常可读、无副作用：未登录、`gh` 版本低、PR 不存在、非 OPEN、base 非 `master`、启用自动合并失败、轮询失败、超时都以非 0 退出，且脚本自身不直接调用合并。
- 已合并的 PR 重复执行时幂等退出 0。

## 4. 非目标

- 不解析检查状态，不拼标题与正文，不做 flake 判定，不自动修复。
- 不删除分支，不提供 `--admin`，不提供跳过检查的开关。
- 不改 PR 标题或描述，不做合并后的拦截式校验。
- 不实现 GitHub HTTP 客户端，全部远端操作走 `gh`。

## 5. 已选方案

薄封装 + 平台约束：

- 平台侧：ruleset 要求 `check` 且只允许 squash；仓库开启 auto-merge；保留默认 squash 消息设置。
- 脚本侧：参数解析 → `gh` 版本与登录预检 → 读取并校验 PR → `gh pr merge --squash --auto` → 轮询 `state` 到 MERGED / CLOSED 或超时。
- 参数面为零：除 PR 号外的任何参数直接报错，从入口形状上杜绝 `--subject`、`--body`。

被放弃的方案：

- **首版「脚本解析 statusCheckRollup + 拼标题与正文」**：重复平台已有能力；`conclusion: ""` 这类状态边界会持续出现，已删除。
- **只写进 AGENTS.md 的命令规则**：LLM 可能忽略文档约束，无法保证不传 `--subject`；约束要落在可执行的入口上。
- **合并后巡检 `master` 标题**：只能事后发现，修复要改写主干，不采用。

## 6. 命令接口

```
npm run pr:merge -- <PR号>
```

| 情形                        | 行为                             | 退出码 |
| --------------------------- | -------------------------------- | ------ |
| 参数缺失或非正整数          | 打印用法，无远端调用             | 1      |
| 其他任何参数                | 报「未识别参数」，无远端调用     | 1      |
| PR 已 MERGED                | 打印合并提交号与后续命令         | 0      |
| PR 非 OPEN / base 非 master | 报原因，不启用自动合并           | 1      |
| OPEN 且 base 为 master      | 启用 auto-merge，等待合并完成    | 见下   |
| 等待中变为 MERGED           | 打印合并提交号与后续命令         | 0      |
| 等待中变为 CLOSED           | 报未合并                         | 1      |
| 15 分钟仍为 OPEN            | 提示自动合并仍启用、修复后可继续 | 1      |

## 7. 等待实现

- 执行 `gh pr merge <PR号> --squash --auto`。若检查已通过，GitHub 会立即合并；否则等待必过检查。
- 之后轮询 `gh pr view <PR号> --json state,baseRefName,mergeCommit`，每 15 秒一次，最多 15 分钟；只读取 PR 状态，不解析检查条目的结论。
- 检查失败时 PR 保持 OPEN，auto-merge 保持启用；脚本超时退出，修复推送后 GitHub 会在检查通过时继续合并。
- 合并成功后打印 merge commit，并提示 `git switch master && git pull --ff-only`；脚本不代为执行本地分支操作。

## 8. 前提与约束

- 仓库开启 Allow auto-merge；ruleset 要求 `check` 且只允许 squash；默认 squash 消息设置保留。
- 依赖 `gh` 已安装并登录（`repo` 权限），版本不低于 2.20.0；不满足直接报错退出。
- 跨平台：`spawn` 传参数数组并 `shell: false`，不拼接命令字符串。
- 运行时只用 `node` 与 `gh` 子进程，不新增依赖；ESLint 零告警，逻辑变更须有单测。

## 9. 风险

- 检查失败时脚本要等满超时才会退出，因为不再解析检查状态；提示里说明修复后推送可继续。
- 默认标题的 `(#N)` 依赖 GitHub 行为：PR #2、#3 已在网页默认消息上验证；`gh` 默认消息路径在后续真实合并中验证。
- auto-merge 被关闭或规则不允许时，`gh pr merge --auto` 的原始错误会透传。
- 脚本挡不住手敲 `gh pr merge --subject`，但仓库唯一入口与 AGENTS.md 都指向本脚本；不再提供可误用的参数面。

## 10. 验收

- `parseArgs`：缺省、非正整数、多余参数（含 `--subject`）均报错；合法输入返回 PR 号。
- 编排单测：已合并幂等；非 OPEN、base 非 master 不合并；启用自动合并的参数精确为 `['pr','merge','<N>','--squash','--auto']`；轮询到 MERGED 退出 0；轮询到 CLOSED、轮询读取失败、超时退出 1。
- `npm run check`、`npm run build` 通过。
- 真实合并一次，确认 `master` 上 squash 标题带 `(#<PR号>)`、正文为提交列表。
