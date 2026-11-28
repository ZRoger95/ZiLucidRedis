# 数据来源与字典更新

三个官方来源，构建期下载、解析、提交进仓库，运行时不请求任何外部网络：

| 来源                                              | 用途                                     |
| ------------------------------------------------- | ---------------------------------------- |
| GitHub Releases（正式版，带发布日期）             | 每条 minor 线的最新 patch tag 与发布日期 |
| `<tag>/src/config.c` 的 `create*Config(...)` 定义 | 指令名、类型、默认值、是否敏感           |
| `<tag>/redis.conf`                                | 分节、官方注释原文、示例值               |

更新字典：

```bash
node scripts/fetch-upstream.ts   # 解析各 minor 线最新正式 release，写入 lock.json 并下载
node scripts/build-dict.ts       # 生成 src/data/dict/<line>.json、releases.json 与 meta.json
```

脚本由 Node 原生 TypeScript 直接运行，会访问 GitHub；应用运行时不访问网络。

构建断言失败时会列出需要人工确认的指令：确实没有默认值的写进 `src/data/no-default.json`，解析不到的写进 `src/data/defaults-override.json`。跨版本改名写在 `src/data/renames.json`。

生成的 `src/data/dict/*.json`、`src/data/official/*.conf`、`src/data/releases.json`、`src/data/dict/meta.json` 由脚本产出，不要手改。人工维护的是 `data/versions.json`、`src/data/no-default.json`、`src/data/defaults-override.json`、`src/data/renames.json`、`src/data/aliases.ts`、`src/data/zh-notes.json`、`src/data/risk-rules.json`、`src/data/extra-directives.json`、`src/data/configurator.json`、`src/data/scenarios.json`、`src/data/sentinel-rules.json`。
