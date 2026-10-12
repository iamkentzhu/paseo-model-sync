import type { PluginServerContext } from "@getpaseo/plugin/server";
import { initialStatus, statusRpc, syncNowRpc, type SyncStatus } from "./shared/contract";
import { paseoConfigPath, readClaudeModels, readPaseoConfig, writeClaudeModels } from "./server/config-file";
import { paseoReload } from "./server/paseo-cli";
import { readState, writeState } from "./server/state-file";
import { readDesired, sameModels } from "./server/sync";
import { watchSettings } from "./server/watcher";

export default function contribute(server: PluginServerContext) {
  let status: SyncStatus = { ...initialStatus };
  let inflight: Promise<SyncStatus> | null = null;

  // 启动时从状态文件加载序号，避免 reload 后清零。
  void readState().then((saved) => {
    status.lastChangeAt = saved.lastChangeAt;
    status.changeSeq = saved.changeSeq;
  });

  const runOnce = async (): Promise<SyncStatus> => {
    const desired = await readDesired();
    const readAt = desired.readAt;

    if (desired.kind === "skip") {
      status = { ...status, state: "skip", message: desired.reason, source: "", models: [], readAt };
      return status;
    }

    const path = paseoConfigPath();
    let existing: ReturnType<typeof readClaudeModels>;
    try {
      existing = readClaudeModels(await readPaseoConfig(path));
    } catch (error) {
      status = {
        ...status,
        state: "error",
        message: `读不到 Paseo 配置：${String(error)}`,
        source: desired.source,
        models: desired.models,
        readAt,
      };
      return status;
    }

    if (existing !== null && sameModels(existing, desired.models)) {
      status = {
        ...status,
        state: "ok",
        message: `已是最新（${desired.models.length} 个模型）`,
        source: desired.source,
        models: desired.models,
        readAt,
      };
      return status;
    }

    const written = await writeClaudeModels(path, desired.models);
    if (!written.changed) {
      status = {
        ...status,
        state: "skip",
        message: written.message,
        source: desired.source,
        models: desired.models,
        readAt,
      };
      return status;
    }

    const reloaded = await paseoReload();
    const now = new Date().toISOString();
    status = {
      ...status,
      state: reloaded.ok ? "ok" : "error",
      message: reloaded.ok
        ? `已同步 ${desired.models.length} 个模型，Paseo 已重载`
        : `${written.message}；${reloaded.message}`,
      source: desired.source,
      models: desired.models,
      readAt,
      lastChangeAt: now,
      changeSeq: status.changeSeq + 1,
    };
    await writeState({ lastChangeAt: now, changeSeq: status.changeSeq });
    return status;
  };

  const run = (): Promise<SyncStatus> => {
    if (inflight) return inflight;
    inflight = runOnce()
      .catch((error: unknown) => {
        status = {
          ...status,
          state: "error",
          message: `同步失败：${String(error)}`,
          readAt: new Date().toISOString(),
        };
        return status;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  server.handle(statusRpc, () => status);
  server.handle(syncNowRpc, () => run());

  const stopWatching = watchSettings(() => {
    void run();
  });

  void run();

  return () => {
    stopWatching();
  };
}
