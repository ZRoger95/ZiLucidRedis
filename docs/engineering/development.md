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

## 静态托管

浏览器的模块脚本不允许在 `file://` 下加载，所以构建产物需要静态服务器托管（`npm run preview`、Nginx、对象存储、GitHub Pages 均可）。`base: './'` 让产物可以部署到任意目录或子路径，但页面地址只能有一层：`/configurator` 可用，`/configurator/xxx` 会更深的地址解析资源而 404 白屏；GitHub Pages 没有 rewrite，只能靠 `404.html` 副本兜底单层路径。

## 发布线上

线上版本：<https://zilucidredis.zroger.top/>

在 GitHub 上发布 Release（状态为 `Published`）后由 GitHub Actions 构建并发布该 tag（[.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)），线上对应该 Release 的提交；push 到 `master` 不触发部署，也可以在 Actions 页面手动重跑。
