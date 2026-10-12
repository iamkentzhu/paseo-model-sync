# 技术概览

> This document is Chinese-only. The English overview lives in [README.md](README.md).
> 本文档只用中文；英文概览见 [README.md](README.md)。

## 架构

```
~/.claude/settings.json  ──监听──>  插件服务端  ──写入──>  ~/.paseo/config.json
       (任何工具写)                  (计算+比对)              (Paseo 自己读)
                                         │
                                         ├──> paseo reload（重载配置）
                                         └──> 客户端轮询 ──> 应用内提示
```

**为什么服务端写配置**：Paseo 的官方配置接口（`paseo.config.patch`）只支持 `additionalModels`（追加模型），不支持 `models`（替换列表）。我们需要 `models` 来隐藏内置模型，所以直接改文件。

## 文件结构

```
paseo-model-sync/
├── index.server.ts          # 服务端入口，注册 RPC、启动监听
├── index.client.tsx         # 客户端入口，注册面板、侧栏项、命令中心
├── shared/
│   └── contract.ts          # RPC 定义：statusRpc、syncNowRpc
├── server/
│   ├── sync.ts              # 读 settings.json，计算应同步的模型
│   ├── config-file.ts       # 读写 ~/.paseo/config.json
│   ├── paseo-cli.ts         # 调用 paseo reload
│   ├── watcher.ts           # 监听 settings.json 的目录（文件替换不丢监听）
│   └── state-file.ts        # 持久化 changeSeq 和 lastChangeAt
└── client/
    ├── use-sync.ts          # 轮询 statusRpc，changeSeq 增加时弹提示
    ├── sidebar-item.tsx     # 常驻侧栏项，托管同步循环
    └── screen.tsx           # 状态面板（只读模式）
```

## 核心流程

### 1. 读 `settings.json` 并计算模型（`server/sync.ts`）

```typescript
readDesired() → { kind: "ok" | "skip", models, fingerprint, ... }
```

- 读 `env.ANTHROPIC_BASE_URL`，没有或为空时跳过（官方订阅）
- 按优先级从 5 个环境变量取模型：
  - `ANTHROPIC_MODEL` (rank=0, 最高)
  - `ANTHROPIC_DEFAULT_OPUS_MODEL` (rank=1)
  - `ANTHROPIC_DEFAULT_SONNET_MODEL` (rank=2)
  - `ANTHROPIC_DEFAULT_FABLE_MODEL` (rank=3)
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL` (rank=4)
- 自动生成 label：`claude-opus-5-5[1M]` → `"Opus 5.5 (1M)"`；`claude-haiku-4-5-20251001` → `"Haiku 4.5"`（去掉 8 位日期后缀）
- 去重，rank 最小的标记 `isDefault: true`
- 返回 fingerprint（SHA256 前 16 位），用于幂等判断

### 2. 比对并写入 Paseo 配置（`server/config-file.ts`）

```typescript
writeClaudeModels(path, models) → { changed, message, backupPath }
```

- 读当前 `~/.paseo/config.json`
- 比对 `agents.providers.claude.models`（ID、label、isDefault 都比）
- 一致时返回 `{ changed: false }`，**不写盘**
- 需要写时：
  1. `copyFile` 备份到 `.bak-modelsync-<时间>`（保留 5 个）
  2. 设置 `claude.models = models`（**不是** `additionalModels`）
  3. 写临时文件 → `rename` 原子覆盖
  4. 保持原文件权限（通常是 `0600`）

### 3. 重载 Paseo（`server/paseo-cli.ts`）

```typescript
paseoReload() → { ok, message }
```

- 定位 `paseo` CLI（先找 PATH，再试 `/Applications/Paseo.app/Contents/Resources/bin/paseo`）
- `paseo reload` 让 daemon 重新读 `config.json`，不重启进程（插件不会被杀）
- 稍等 300ms 避开写入与读取的竞态

### 4. 持久化状态（`server/state-file.ts`）

```typescript
writeState({ lastChangeAt, changeSeq })
```

- 写入 `~/.paseo/plugin-data/paseo-model-sync/state.json`
- 插件 reload 时从文件加载，`changeSeq` 不归零
- 客户端根据 `changeSeq` 增加判断是否弹提示

### 5. 客户端轮询与提示（`client/use-sync.ts`）

```typescript
useModelSync(onSynced, { watch: true })
```

- 每 5 秒调用一次 `statusRpc`
- 比对 `changeSeq`，增加时调用 `onSynced(message)`
- 侧栏项里的实例用 `useToast().show(message, { variant: "success", durationMs: 3600 })`

## 设计取舍

### 为什么不用 `additionalModels`

`additionalModels` 会**追加**到内置清单后面，Paseo 的模型选择器里会同时显示：

- 内置的 17 个模型（各种上下文长度、各种日期版本）
- 你配置的 4 个模型

用户要求"**只显示配置的模型**"，所以必须用 `models`（整体替换）。

### 为什么服务端写文件而不是客户端调 API

Paseo 0.11.1 的 `config.patch` 只认 `additionalModels`。服务端：

1. 有文件系统权限
2. 可以调 `paseo reload`（需要 CLI 在 PATH 或已知路径）
3. 避免客户端并发写入冲突

### 为什么监听目录而不是文件

多数配置工具（包括 CC Switch）写文件的方式是：

```bash
写 settings.json.tmp
rename settings.json.tmp settings.json
```

直接监听文件会在第一次 `rename` 后失效（inode 变了）。监听目录并过滤 `filename === "settings.json"` 的事件就不会丢。

### 为什么有 2 秒防抖

CC Switch 和其他工具可能分多步写 `settings.json`（先写一部分，再追加）。等 2 秒让它写完再读，避免读到半成品。

### 为什么持久化 `changeSeq`

插件 reload 时内存状态清空，`changeSeq` 归零。客户端轮询到 `seq=0` 会以为是首次启动，不弹提示。持久化后：

- 真正的变更会让 `changeSeq` 从 N 变成 N+1
- 客户端见过 N，看到 N+1 时弹提示
- 见过 N+1 后再看到 N+1，不重复弹

## 验证要点

1. **改 `settings.json` → 自动同步**：已验证（4 次真实链路）
2. **内容没变不写盘**：已验证（12 秒观测，mtime 未变）
3. **paseo reload 真的生效**：已验证（daemon 日志里有 `Loaded from config.json`）
4. **1M 与思考档位保留**：已验证（`paseo provider models claude` 输出完整）
5. **跳过官方订阅场景**：已验证（移除 BASE_URL 后配置不动）
6. **状态文件持久化**：已验证（`changeSeq` 在 reload 后保留）

## 已知限制

- **只支持 Anthropic Claude**：代码里写死了 `agents.providers.claude`
- **只在 macOS 上测过**：依赖 `rename` 覆盖的原子性，Linux/Windows 未测试
- **Paseo 0.11.1+**：更早版本的配置结构可能不同
- **paseo CLI 路径**：先试 PATH，再试 `/Applications/Paseo.app`，其他位置需要手动改 `server/paseo-cli.ts`

## 未来可能改进

- [ ] 支持其他 provider（OpenAI、Codex 等）
- [ ] 配置界面（选择要同步哪些环境变量）
- [ ] 双向同步（Paseo 里改模型 → 写回 settings.json）
- [ ] 状态面板显示上次同步的具体模型变化（diff）
