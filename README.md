# Redis 配置体检（ZiLucidRedis）

把一份 `redis.conf` 贴进来，逐项对照官方默认值给出体检结果：哪些被改过、哪些不认识、哪些已经废弃、有没有危险组合，并把官方注释补在每一行上方。改完直接导出新的 conf。

纯前端静态站，没有后端，配置内容不会离开浏览器。

## 使用

- 粘贴文本、上传 `.conf` 文件，或把文件直接拖进编辑区。
- 顶部选 Redis 版本（6.2 到 8.10 共 10 条 minor 线，每条线取最新正式 patch，显示发布日期）。
- 「内联注释」三档：只补缺失（默认）/ 全部显示 / 关闭。
- `Ctrl+K`（Mac 上 `⌘K`）搜索配置项；文件里没有的项可以直接插到对应分节。
- 底部默认是「体检结果」：按告警、缺失、已改、未知、已移除、版本不支持、重复分组列出计数与明细，
  点击明细定位到编辑器；缺失项可直接补入官方默认值，官方无默认值的（如 `bind`）会打开搜索面板。
- 底部「配置对比」是 IDEA 风格的并排 diff：左行号 / 你的配置 / 箭头 / 官方默认 / 右行号，
  修改行左红右绿并做词级高亮，未改行折叠；点箭头可把单行改回官方默认值。
  「只看差异」开关在对比页头，同时作用于编辑器和对比表。
- diff 行组只占一个 Tab 停靠点：`↑` / `↓` 移动，`Home` / `End` 到首尾，`Enter` 跳转且焦点留在 diff，
  `Esc` 回到编辑器；行内 `»` 按钮可单独 `Tab` 聚焦。
- 导出三种：原样导出、补全官方注释后导出、还原密码后导出。

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
```

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

- `src/lib/`：解析、归一化、分析、风险规则、密码占位、搜索、导出（纯函数，全部有单测）
- `src/components/`：工具栏、体检结果面板、CodeMirror 编辑器、详情面板、搜索面板
- `src/data/dict/`：每版本一份配置项字典 + 跨版本索引
- `docs/superpowers/specs/`、`docs/superpowers/plans/`：设计文档与实施计划
