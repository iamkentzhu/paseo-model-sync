import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { paseoConfigPath } from "./config-file";

/** 跨插件重载保留的少量状态：最近写入时间、变更序号。 */
export interface SyncState {
  lastChangeAt: string | null;
  changeSeq: number;
}

const EMPTY: SyncState = { lastChangeAt: null, changeSeq: 0 };

/**
 * 状态文件放在 Paseo 目录下一个独立子目录里，和 config.json 分开。
 * 插件被卸载时删掉这个目录即可，不会在 Paseo 主配置里留垃圾。
 */
function statePath(): string {
  return join(dirname(paseoConfigPath()), "plugin-data", "paseo-model-sync", "state.json");
}

export async function readState(): Promise<SyncState> {
  try {
    const raw = JSON.parse(await readFile(statePath(), "utf8")) as Partial<SyncState>;
    return {
      lastChangeAt: typeof raw.lastChangeAt === "string" ? raw.lastChangeAt : null,
      changeSeq: typeof raw.changeSeq === "number" ? raw.changeSeq : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeState(state: SyncState): Promise<void> {
  const path = statePath();
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  } catch {
    // 状态文件只是锦上添花，写不进去不影响同步。
  }
}
