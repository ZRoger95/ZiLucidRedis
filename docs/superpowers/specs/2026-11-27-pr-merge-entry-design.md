# PR 合并入口：squash 标题固定带 PR 编号设计

日期：2026-11-27
状态：已实现
范围：新增一个本地合并入口 `npm run pr:merge -- <PR号>`，让 squash 合并提交的标题稳定为 `<PR 标题> (#<PR号>)`，正文稳定为该 PR 的提交清单，并在合并前等待该 PR 的检查全部通过。只影响维护者本地的合并动作，不改产品代码、不改 CI 工作流。

## 1. 意图：为什么做

2026-11-27 合并 PR #5 时，用 `gh pr merge 5 --squash --subject "…"` 指定了标题，`--subject` 是整体替换，GitHub 默认模板里的 `(#5)` 被一并覆盖，`master` 上留下一条不带 PR 编号的提交。同一次调用还因为没传 `--body`，squash 提交正文为空，网页合并时自带的提交清单也一起丢了。结果是 `git log` 无法从提交回溯到 PR 与改动明细，只有 PR 页面反向记录。

这类问题有两个特征：一是**只在合并那一刻产生**，事后补救要强推主干；二是**靠记忆无法稳定避免**，`gh` 的帮助里 `--subject`、`--body` 一直在，手一滑就中。

按仓库既有原则——「能表达成 Lint 或类型约束的纠正优先做成确定性检查，而不是往文档加自然语言规则」——把这件事做成一个可执行入口：标题与正文都由脚本拼，人没有机会漏。

## 2. 现状

- 合入方式是 squash：`master` 上 `#3`、`#4` 由网页 squash 生成，标题形如 `fix: … (#4)`，正文为提交清单；`#5` 的 `b2da5f3` 既缺编号也缺正文，是本次事故。
- 合并依赖 GitHub CLI：`gh` 已安装并登录（`repo`、`workflow` scope），本机版本 2.106.0；PR 检查由 `.github/workflows/ci.yml` 提供，包含 `npm run check`、`npm run build` 与 `npm run smoke`，单次约 1 分钟。
- `scripts/` 已有确定性检查的先例：`scripts/check-css-comments.ts` 由 `npm run lint` 调用，纯逻辑放在 `scripts/lib/`，测试放 `tests/`（如 `tests/checkCssComments.test.ts`）。脚本统一用 Node 原生 TypeScript 运行（`node --experimental-strip-types`）。
- 本设计实现后，`npm run pr:merge -- <PR号>` 是唯一合并入口；`scripts/lib/pr-merge.ts` 放纯函数，`scripts/pr-merge.ts` 做 CLI 编排。

## 3. 目标

- 提供唯一合并入口：`npm run pr:merge -- <PR号>`。
- 该入口**没有跳过检查的开关**：无论什么场合都先等该 PR 的检查全部通过，再合并；任一检查失败立即中止，PR 保持 OPEN，不合并、不重试。
- 合并提交标题固定为 `<PR 标题> (#<PR号>)`；标题已以 `(#<PR号>)` 结尾时不重复追加。
- 合并提交正文固定为该 PR 的提交清单（每个提交一行 `* <首行>`），与网页 squash 的默认正文等价，避免空正文。
- 异常情况给出可读提示并以非 0 退出，且不产生副作用：参数缺失/非法、PR 不存在、PR 已合并、PR 非 OPEN、base 非 `master`、`gh` 未登录、`gh` 版本过低、等待超时。
- 纯逻辑（标题与正文拼接、参数解析、检查状态归约）有 Vitest 单测；命令编排可注入执行器，便于在测试里断言「CI 失败不合并」「参数原样传递」。

## 4. 非目标

- 不删除任何分支（本地与远程）；删除由人决定，脚本不提供删除开关。
- 不重试失败的检查，不做 flake 判定，不自动修复代码。
- 不改写已发布历史：不 amend、不 force push `master`。
- 不改 PR 标题或描述，不代写 release notes。
- 不自己实现 GitHub HTTP 客户端；所有远端操作走 `gh`。
- 不做合并后的**拦截式**守卫（不在 `push: master` 的 CI 里阻断构建）。只报告型的巡检作为可选闭环记在 §9，需要时另开 spec。
- 不改 `commit-msg` / commitlint 规则，理由见 §5。

## 5. 已选方案

已选：**脚本 + npm script，替换合并命令本身**。

- `scripts/lib/pr-merge.ts`：纯函数。
  - `squashSubject(title, prNumber)`：标题已以 `(#<该 PR 号>)` 结尾时原样返回，否则追加 ` (#<该 PR 号>)`；不删除标题里本来就有的其他编号引用（如正文中提及 `(#12)`），避免改写人的措辞。
  - `squashBody(commits)`：按顺序把每个提交的首行拼成 `* <首行>` 列表，行间用换行分隔；空列表返回空串。
  - `parseArgs(argv)`：只接受一个正整数 PR 号；出现任何其他参数（包括历史设想过的 `--now`）一律报「未识别参数」。
  - `summarizeChecks(rollup)`：把 `statusCheckRollup` 归约为 `pass` / `fail` / `pending` 三态。
- `scripts/pr-merge.ts`：CLI 编排。预检 `gh` 登录与版本 → 校验参数 → 读 PR 元数据 → 等检查 → `gh pr merge --squash --subject --body` → 输出合并提交号与后续命令提示。
- 把 `gh` 调用封装为可注入的执行函数，CLI 主流程接受执行器参数，默认用 `child_process`。这样「检查失败时不得调用合并」「含特殊字符的标题原样进入参数数组」都能在单测里断言，而不是靠人眼。

被放弃的方案：

- **方案 B（写进 `AGENTS.md`）**：这是工具职责，不是每次会话都要遵守的工程规则；写进常驻规则会让文档治理多一条迟早被忽略的文案，且仍然靠人记。
- **方案 C（合并后在 `push: master` 的 CI 检查标题）**：只能事后发现；修复要强推主干，为一个可读性问题制造一次历史重写与一次 `master` 红/黄，还会训练人忽略 `master` 的 CI。
- **方案 D（commitlint / `commit-msg` 钩子）**：squash 提交由 GitHub 服务端生成，本地钩子根本不执行，管不到。
- **方案 E（合并时不传 `--subject`，靠默认模板）**：零成本但要靠记忆；`gh pr merge` 的 `--subject` 一直在帮助里，本次事故正是这么发生的，因此不把「记得别传」当作约束。
- **方案 F（提供 `--now` 跳过检查）**：这是给 agent 用的入口，任何绕过检查的口子迟早会被用上；脚本不做「忙时先合」的取舍。

## 6. 命令接口

```
npm run pr:merge -- <PR号>
```

| 参数         | 行为                                            |
| ------------ | ----------------------------------------------- |
| `<PR号>`     | 必填，正整数；缺省或非法时打印用法并以非 0 退出 |
| 其他任何参数 | 打印用法并以非 0 退出，不做任何远端调用         |

固定行为（无开关）：

- 合并前必须等检查全部通过；没有「跳过等待」的开关。
- base 必须是 `master`，否则中止并提示（防止误合同一条分支上的其他目标）。
- PR 状态必须是 `OPEN`；已是 `MERGED` 时打印「无需操作」并退出 0（幂等，不重复调用合并）。
- `--subject` 由 `squashSubject` 生成；`--body` 由 `squashBody` 生成，取该 PR 的提交清单。两者都显式传，不依赖 GitHub 默认模板。
- 合并后打印合并提交号，并提示后续命令（`git switch master && git pull --ff-only`）；脚本不代为执行本地分支操作。

## 7. 检查等待的实现

- 轮询 `gh pr view <PR号> --json statusCheckRollup`，而不是依赖 `gh pr checks --watch` 的退出码：后者的退出码语义（存在 pending 时非 0）容易与「检查失败」混淆，JSON 里的结论字段更确定。
- `statusCheckRollup` 的条目有两种类型，两者都支持，不留隐含假设：

| 条目类型                      | 成功                                            | 失败                                                            | 未完成                           |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| `CheckRun`（本仓库 CI）       | `conclusion` 为 `SUCCESS`、`NEUTRAL`、`SKIPPED` | `FAILURE`、`CANCELLED`、`TIMED_OUT`、`ACTION_REQUIRED`、`STALE` | `conclusion` 为 `null`           |
| `StatusContext`（第三方状态） | `state` 为 `SUCCESS`                            | `state` 为 `ERROR`、`FAILURE`                                   | `state` 为 `PENDING`、`EXPECTED` |

- 归约规则：任一失败 → `fail`；否则存在未完成 → `pending`；全部成功 → `pass`。列表为空视为 `pending`（检查尚未创建）。表中未列出的结论值一律按失败处理——宁可拦下，也不把不认识的状态当作通过。
- 刚推送、检查尚未创建时继续轮询，最多 15 分钟；超时中止并提示去看 PR 页面。
- 轮询间隔 15 秒，输出每次状态变化，避免终端长时间无反馈。

## 8. 前提与约束

- 依赖 `gh` CLI 已安装并登录，且对仓库有 `repo` 权限；脚本启动时用 `gh auth status` 预检，未登录直接提示「请先 gh auth login」并退出。
- 版本预检：启动时解析 `gh --version`，要求不低于 **2.20.0**（`pr view --json statusCheckRollup` 与 `--json commits` 的保守下限）；低于则提示升级并退出。不满足能力时直接报错，**不做**任何文本解析兜底。
- 跨平台：调用 `gh` 一律 `spawn` / `execFile`，传参数数组并 `shell: false`；不拼接命令字符串、不依赖 shell 语法，路径用 `node:path`。npm script 保持单条 `node …` 命令，Windows 与 macOS 行为一致。
- 运行时只用 `node` 与 `gh` 子进程，不新增运行时依赖；脚本风格与 `scripts/` 现有 Node 原生 TS 一致。
- ESLint 覆盖 `scripts/`，`npm run check` 必须零告警；纯函数单测进 `npm test`。

## 9. 风险与残余风险

- **等待阻塞**：CI 约 1 分钟，脚本前台阻塞；由人主动触发，可接受。15 分钟上限是防挂死，不是常态。
- **检查集合变动**：PR 上若新增检查，轮询期间会读到新条目；只要最终结论都成功即通过，中途出现失败立即中止。
- **`gh` 版本差异**：已由 §8 的版本预检封住；若字段在某版本上不存在，脚本报错退出，不猜。
- **标题与正文长度**：服务端生成的提交不受 commitlint 约束，脚本不截断；正文条目数等于提交数，长分支会得到较长正文，可读性由人负责（压成单条提交的流程另说）。
- **残余风险：脚本挡不住再次手敲 `gh pr merge --subject`**。网页合并默认带编号，安全；命令行手敲仍可能丢编号。可选的闭环是**只报告型巡检**：定时检查 `master` 新提交标题是否以 `(#<数字>)` 结尾，只出报告不拦截——与现有外环定时模糊「只报告不自动改」的文化一致，也不违反 §4 排除拦截式守卫的取舍。该巡检不在本次范围，需要时另开 spec。
- **误合并风险**：脚本不提供 `--admin`、不跳过分支保护；`gh` 自身拒绝时把原始错误透传。

## 10. 验收

- `npm run pr:merge`（无参数）打印用法、退出非 0，无远端调用；`npm run pr:merge -- 6 --now` 报「未识别参数」。
- `squashSubject('feat: x', 6)` 为 `feat: x (#6)`；`squashSubject('feat: x (#6)', 6)` 仍为 `feat: x (#6)`（不重复）；`squashSubject('feat: x (#12)', 6)` 为 `feat: x (#12) (#6)`（不改写正文里已有的其他引用）。
- `squashBody([{ headline: 'feat: a' }, { headline: 'test: b' }])` 为 `* feat: a\n* test: b`；空列表为空串。
- 标题含引号、括号、中文、emoji 时，执行器收到的参数数组中该值完整原样，未被转义或截断。
- 检查失败时执行器记录中不含 `merge` 调用（注入式单测断言）；`CheckRun` 与 `StatusContext` 两种条目按 §7 的表归约。
- 已合并 PR 再执行时退出 0 且不调用合并（用现有的 `#1`–`#5` 验证）。
- 真实试跑：不存在的 PR 号给出明确报错；`gh` 版本低于下限时提示升级；均不产生任何合并。
- `npm run check`、`npm run build` 通过。
