# paseo-model-sync 工作约束

给 agent 的行为约束。项目背景和用法见 `README.md`，架构和设计取舍见 `OVERVIEW.md`。

## 硬约束

- **这个插件会写 `~/.paseo/config.json`，而 Paseo 正是我们工作时用的工具。** 改动前先备份，验证必须走真实链路：改 `settings.json` 后确认自动同步、确认 `paseo reload` 生效。
- **没有构建步骤。** Paseo 直接加载 `.tsx` 源码，改完 `paseo plugin reload paseo-model-sync` 即可，不要引入打包工具。
- **不要改 `additionalModels`。** 用 `models` 替换整个列表是需求本身（要隐藏内置清单），换回追加会破坏功能。
- 报告同步结果时给具体证据（`paseo provider models claude --json` 输出、config.json 的 mtime 或备份文件名），不要只说"已同步"。

## 环境事实

- Kent 的主要工作环境是 Mac mini（24 小时开机），Paseo / Claude Code / Codex 都在上面跑。
- `paseo` CLI 不在登录 shell 的 `PATH` 里，实际路径 `/Applications/Paseo.app/Contents/Resources/bin/paseo`。
- 插件运行状态：`paseo plugin ls`；日志：`paseo plugin logs paseo-model-sync`。
- 状态文件：`~/.paseo/plugin-data/paseo-model-sync/state.json`；配置备份：`~/.paseo/config.json.bak-modelsync-*`（保留 5 个）。

## 已知限制（不要当成 bug 去修）

- 只处理 `agents.providers.claude`，不碰 Codex 和其他 provider。
- 没有 `ANTHROPIC_BASE_URL` 时故意跳过（官方订阅场景），这是设计而非缺陷。
- 只在 macOS 上验证过；`rename` 覆盖的原子性在 Linux/Windows 未测。
