# 本地开发与验证

## 命令

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck
npm run build      # 产物在 dist/
npm run preview    # 预览构建产物
npm run smoke      # 浏览器冒烟，截图与导出物在 .screenshots/smoke/
npm run fuzz       # 外环模糊：放大轮数跑性质测试，报告在 .fuzz/report.md
```

冒烟首次运行前需 `npx playwright install chromium`；链路设计与选择器地图见[运行时验证层设计](../superpowers/specs/2026-11-24-runtime-verification-design.md)与[功能地图](feature-map.md)。

`npm run fuzz` 默认放大 20 倍轮数并随机 seed，`FUZZ_SEED` / `FUZZ_MULTIPLIER` 可固定重放；GitHub Actions 每周日北京时间凌晨 3 点定时跑，失败只产报告不阻塞合并与部署，见[外环定时模糊设计](../superpowers/specs/2026-11-25-outer-loop-fuzz-design.md)。

CI 的 `check` job 还会校验 PR 正文：四个二级标题齐全、顺序与模板一致且「## 验证」非空，失败即红；正文经 `PR_BODY` 环境变量传入，模板见 [.github/pull_request_template.md](../../.github/pull_request_template.md)，设计见 [PR 正文门禁设计](../superpowers/specs/2026-11-28-pr-body-gate-design.md)。

## 测试

- `src/lib/` 是纯函数层，必须有 Vitest 单测；解析、密码、导出、diff 的边界先补能复现的测试。
- 能表达成 Lint/类型约束的纠正优先做成确定性检查，而不是往文档加自然语言规则；反复被误用的 API 改签名让误用编译不过。
- 安全与往返不变量由 `tests/*.property.test.ts` 覆盖，生成器在 [tests/arbitraries.ts](../../tests/arbitraries.ts)。

## 静态托管

浏览器的模块脚本不允许在 `file://` 下加载，所以构建产物需要静态服务器托管（`npm run preview`、Nginx、对象存储、GitHub Pages 均可）。`base: './'` 让产物可以部署到任意目录或子路径，但页面地址只能有一层：`/configurator` 可用，`/configurator/xxx` 会更深的地址解析资源而 404 白屏；GitHub Pages 没有 rewrite，只能靠 `404.html` 副本兜底单层路径。

## 发布线上

线上版本：<https://zilucidredis.zroger.top/>

在 GitHub 上发布 Release（状态为 `Published`）后由 GitHub Actions 构建并发布该 tag（[.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)），线上对应该 Release 的提交；push 到 `master` 不触发部署，也可以在 Actions 页面手动重跑。
