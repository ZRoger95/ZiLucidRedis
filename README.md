# Redis 配置体检（ZiLucidRedis）

把一份 `redis.conf` 贴进来，逐项对照官方默认值给出体检结果：哪些被改过、哪些不认识、哪些已经废弃、有没有危险组合，并把官方注释补在每一行上方。改完直接导出新的 conf。

纯前端静态站，没有后端，配置内容不会离开浏览器。

## 线上版本

<https://zilucidredis.zroger.top/>

在 GitHub 上发布 Release（状态为 `Published`）后由 GitHub Actions 构建并发布该 tag（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)），线上对应该 Release 的提交；push 到 `master` 不触发部署，也可以在 Actions 页面手动重跑。

## 使用

- 粘贴文本、上传 `.conf` 文件，或把文件直接拖进编辑区。
- 顶部选 Redis 版本（6.2 到 8.10 共 10 条 minor 线，每条线取最新正式 patch，显示发布日期）。
- 「内联注释」三档：只补缺失（默认）/ 全部显示 / 关闭。
- `Ctrl+K`（Mac 上 `⌘K`）搜索配置项；文件里没有的项可以直接插到对应分节。
- `Ctrl+F`（Mac 上 `⌘F`）在当前栏查找：左右栏各自独立，支持区分大小写、全词与正则，
  `Enter` / `Shift+Enter` 切换命中，`Esc` 关闭。
- 底部默认是「体检结果」：按告警、缺失、已改、未知、已移除、版本不支持、重复分组列出计数与明细，
  点击明细定位到编辑器；缺失项可直接补入官方默认值，官方无默认值的（如 `bind`）会打开搜索面板。
- 底部「配置对比」是 IDEA 风格的并排 diff：左行号 / 你的配置 / 箭头 / 官方默认 / 右行号，
  修改行左红右绿并做词级高亮，未改行折叠；点箭头可把单行改回官方默认值。
  「只看差异」开关在对比页头，同时作用于编辑器和对比表。
- diff 行组只占一个 Tab 停靠点：`↑` / `↓` 移动，`Home` / `End` 到首尾，`Enter` 跳转且焦点留在 diff，
  `Esc` 回到编辑器；行内 `»` 按钮可单独 `Tab` 聚焦。
- 导出三种：原样导出、补全官方注释后导出、还原密码后导出。
- 导出按钮右侧（竖线分隔）的 GitHub 图标在新窗口打开[仓库首页](https://github.com/ZRoger95/ZiLucidRedis)，生成向导页头也有同一个入口。

## 生成配置（向导）

体检页右上角「生成配置」进入 `/configurator`（地址不要带末尾斜杠，静态托管下会白屏）：

- 第 1 步选版本，之后按官方 `redis.conf` 的区域一区一步；左侧导航可跳转并显示各步改动数。
- 每个字段用官方默认值做占位提示，只有输入过的项才取消注释写入；未改动的行保持官方注释原样。
- `include`、`loadmodule`、`user`、`rename-command` 在对应区域单独填写；`config.c` 里有、官方模板未收录的指令放在最后的「其他」步。
- 完成页可预览、下载 `redis-<版本>.conf`，或「带回体检页」继续检查（密码会先替换成 `${env_*}` 占位符）。
- 草稿保存在浏览器本地；`requirepass` 与 ACL 用户行不落盘，刷新后需要重填。

## 密码怎么处理

导入时，`requirepass`、`masterauth`、`tls-key-file-pass`、`tls-client-key-file-pass` 和
ACL `user ... >pass` 的值会被就地替换成 `${env_requirepass}` 这类占位符：

- 编辑器里看到的、`localStorage` 里存的、默认导出的，都是占位符；
- 原始密码只保留在本次会话的内存里，刷新即丢；
- 需要明文时才用「还原密码后导出」，会有一次二次确认。

注意：**Redis 本身不解析环境变量**。占位符需要部署侧（docker-entrypoint、envsubst、confd 等）替换，否则实例会带着字面量启动。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck
npm run build      # 产物在 dist/
npm run preview    # 预览构建产物
npm run smoke      # 浏览器冒烟，截图与导出物在 .screenshots/smoke/
```

冒烟首次运行前需 `npx playwright install chromium`；链路设计与选择器地图见 [运行时验证层设计](docs/superpowers/specs/2026-11-24-runtime-verification-design.md) 与 [功能地图](docs/engineering/feature-map.md)。

浏览器的模块脚本不允许在 `file://` 下加载，所以构建产物需要静态服务器托管（`npm run preview`、Nginx、对象存储、GitHub Pages 均可）。

## 数据从哪来

三个官方来源，构建期下载、解析、提交进仓库，运行时不请求任何外部网络：

| 来源 | 用途 |
|---|---|
| GitHub Releases（正式版，带发布日期） | 每条 minor 线的最新 patch tag 与发布日期 |
| `<tag>/src/config.c` 的 `create*Config(...)` 定义 | 指令名、类型、默认值、是否敏感 |
| `<tag>/redis.conf` | 分节、官方注释原文、示例值 |

更新字典：

```bash
node scripts/fetch-upstream.ts   # 解析各 minor 线最新正式 release，写入 lock.json 并下载
node scripts/build-dict.ts       # 生成 src/data/dict/<line>.json、releases.json 与 meta.json
```

脚本由 Node 原生 TypeScript 直接运行，需要 Node 22.18+（本项目使用 Node 24）。

构建断言失败时会列出需要人工确认的指令：确实没有默认值的写进 `src/data/no-default.json`，
解析不到的写进 `src/data/defaults-override.json`。跨版本改名写在 `src/data/renames.json`。

## 目录

- `src/lib/`：解析、归一化、分析、风险规则、diff、体检分组、查找、密码占位、导出、配置生成（纯函数，全部有单测）
- `src/components/`：工具栏、体检结果面板、CodeMirror 编辑器、官方面板、配置对比、栏内查找、搜索面板、导出菜单
- `src/components/configurator/`：生成向导的步骤导航、字段、自由行与完成页
- `src/data/dict/`：每版本一份配置项字典 + 跨版本索引
- `docs/superpowers/specs/`、`docs/superpowers/plans/`：设计文档与实施计划
