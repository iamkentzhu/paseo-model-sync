# paseo-model-sync

A Paseo plugin that syncs the model list from `~/.claude/settings.json` into Paseo, keeping the 1M context window and thinking levels intact.

一个 Paseo 插件：把 `~/.claude/settings.json` 里的模型自动同步进 Paseo，保留 1M 上下文窗口和思考档位。

---

## The problem / 解决什么问题

When you point Claude Code at a third-party provider (CC Switch, or any tool that writes `~/.claude/settings.json`), Paseo does read the real model names — but models discovered from `settings.json` arrive **without thinking levels** (upstream issue [getpaseo/paseo#6434](https://github.com/getpaseo/paseo/issues/6434)). Writing them into Paseo's own config makes Paseo match them against its built-in catalog and fill the levels back in.

CC Switch 直连模式（或任何改 `settings.json` 的工具）会把真实模型名写进环境变量。Paseo 能读到，但从 settings.json 发现的模型**没有思考档位**（上游 issue [getpaseo/paseo#6434](https://github.com/getpaseo/paseo/issues/6434)）。写进 Paseo 自己的配置后，Paseo 按名字匹配内置清单，补上档位。

The result / 效果：

- **Only your configured models show up** — the plugin writes `models` (replace) rather than `additionalModels` (append), so Paseo stops listing its built-in catalog alongside yours.
- **只显示你配置的模型** —— 插件写 `models`（整体替换）而不是 `additionalModels`（追加），Paseo 不再把内置清单混在你自己的模型旁边。

- **IDs stay byte-identical, 1M marker included** — `claude-opus-5-5[1M]` survives the round trip.
- **模型 ID 原样保留，1M 标记不丢** —— `claude-opus-5-5[1M]` 原样进 Paseo。

- **Thinking levels come back** — Opus / Sonnet / Fable get `low, medium, high, xhigh, max, ultracode`; Haiku gets `none`.
- **思考档位补齐** —— Opus / Sonnet / Fable 拿到 `low, medium, high, xhigh, max, ultracode`，Haiku 拿到 `none`。

- **Tool-agnostic** — anything that writes `~/.claude/settings.json` works: CC Switch, Magpie, or your own script.
- **不绑定工具** —— 只要写 `~/.claude/settings.json` 就能同步：CC Switch、Magpie 或你自己的脚本都行。

---

## How it works / 工作原理

```
~/.claude/settings.json  ──watch──>  plugin server  ──write──>  ~/.paseo/config.json
   (written by any tool)             (compute+diff)              (Paseo reads this)
                                          │
                                          ├──> paseo reload
                                          └──> client polls ──> in-app toast
```

**The server writes the config file, not the plugin API.** Paseo 0.11.1's `config.patch` only accepts `additionalModels` — it silently drops `models`. Since hiding the built-in catalog requires `models`, the plugin edits `~/.paseo/config.json` directly.

**由服务端直接改配置文件，不走插件 API。** Paseo 0.11.1 的 `config.patch` 只认 `additionalModels`，传 `models` 会被静默丢弃。要隐藏内置清单就必须用 `models`，所以插件直接改 `~/.paseo/config.json`。

Full architecture and design tradeoffs: [OVERVIEW.md](OVERVIEW.md).

完整架构与设计取舍见 [OVERVIEW.md](OVERVIEW.md)。

---

## Behavior / 行为

**Trigger / 触发** — about 2 seconds after `settings.json` changes. The watcher listens on the **directory**, not the file, because most tools write via temp-file-then-rename and a file-level watcher dies on the first rename.

**触发时机** —— `settings.json` 变更后约 2 秒。监听的是**目录**而非文件，因为多数工具用「写临时文件再 rename」的方式落盘，直接监听文件在第一次 rename 后就失效了。

**Skipped when / 跳过场景**：

- No `ANTHROPIC_BASE_URL` — official subscription; Paseo's built-in catalog is the better fit, so nothing is overwritten.
- 没有 `ANTHROPIC_BASE_URL` —— 官方订阅，Paseo 内置清单更合适，不覆盖。

- `settings.json` is missing or not valid JSON.
- `settings.json` 不存在或不是合法 JSON。

- No model variables found.
- 读不到任何模型配置。

**Write path / 写入过程**：

1. Read models from 5 env vars by priority: `ANTHROPIC_MODEL` > Opus > Sonnet > Fable > Haiku.
   从 5 个环境变量按优先级取模型：`ANTHROPIC_MODEL` > Opus > Sonnet > Fable > Haiku。
2. Diff against `agents.providers.claude.models` in `~/.paseo/config.json` — identical means no write at all.
   与 `~/.paseo/config.json` 里的 `claude.models` 比对，一致就不写盘。
3. Atomic write: backup (keeps 5) → temp file → `rename`, original permissions preserved.
   原子写入：备份（保留 5 个）→ 写临时文件 → `rename` 覆盖，保留原文件权限。
4. `paseo reload` so the daemon re-reads the config without restarting the plugin process.
   调用 `paseo reload`，daemon 重读配置且不重启插件进程。
5. In-app toast, e.g. `已同步 4 个模型，Paseo 已重载`.
   应用内弹一条提示，如「已同步 4 个模型，Paseo 已重载」。

**State / 状态持久化** — `changeSeq` and `lastChangeAt` live in `~/.paseo/plugin-data/paseo-model-sync/state.json` so the toast counter survives plugin reloads.

**状态持久化** —— `changeSeq` 和 `lastChangeAt` 存在 `~/.paseo/plugin-data/paseo-model-sync/state.json`，插件 reload 后提示计数器不归零。

---

## Install / 安装

```bash
git clone https://github.com/iamkentzhu/paseo-model-sync.git
paseo plugin install ./paseo-model-sync
```

Or add the directory from Paseo Desktop's plugin manager.

或在 Paseo Desktop 的插件管理里添加这个目录。

The `paseo` CLI is not on `PATH` when Paseo ships as an app bundle; the plugin falls back to `/Applications/Paseo.app/Contents/Resources/bin/paseo`.

Paseo 以 App 形式安装时 `paseo` CLI 不在 `PATH` 里，插件会回退到 `/Applications/Paseo.app/Contents/Resources/bin/paseo`。

---

## Development / 开发

```bash
npm install

npx tsc --noEmit                    # typecheck / 类型检查
paseo plugin reload paseo-model-sync # hot reload / 热重载
paseo plugin logs paseo-model-sync   # logs / 查看日志
paseo plugin ls                      # status / 查看状态
```

No build step — Paseo loads the `.tsx` sources directly.

没有构建步骤，Paseo 直接加载 `.tsx` 源码。

---

## Known limits / 已知限制

- **Anthropic Claude only.** `agents.providers.claude` is hardcoded; Codex and other providers are not touched.
- **只支持 Anthropic Claude。** 代码里写死 `agents.providers.claude`，不处理 Codex 等其他 provider。
- **Tested on macOS only.** The atomic write relies on `rename` overwrite semantics; Linux and Windows are untested.
- **只在 macOS 上测过。** 原子写入依赖 `rename` 覆盖语义，Linux/Windows 未测试。
- **Paseo 0.11.1+.** Older versions may use a different config shape.
- **需要 Paseo 0.11.1 及以上。** 更早版本的配置结构可能不同。
- **CLI path is guessed.** `PATH` first, then the standard app bundle path; other install locations need an edit to `server/paseo-cli.ts`.
- **CLI 路径靠猜。** 先找 `PATH`，再试标准 App 路径；其他安装位置需要改 `server/paseo-cli.ts`。

---

## When you can delete this / 什么时候可以删掉

Either condition is enough / 满足**任一**即可删除：

1. Paseo fixes [#6434](https://github.com/getpaseo/paseo/issues/6434) **and** you don't mind the built-in catalog sitting next to your models.
   Paseo 修好了 [#6434](https://github.com/getpaseo/paseo/issues/6434)，**并且**你不在意列表里还混着十几个内置模型。
2. CC Switch (or whichever tool you use) ships its own Paseo plugin that syncs models officially.
   CC Switch（或你用的工具）自己提供了官方同步模型的 Paseo 插件。

Until then, this plugin is what makes Paseo cooperate with third-party provider tools.

在那之前，这个插件让 Paseo 与第三方配置工具协同工作。

---

## License

No license file. Personal tool, provided as-is.

无 LICENSE 文件。个人自用工具，按原样提供。
