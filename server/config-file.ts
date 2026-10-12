import { copyFile, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SyncedModel } from "../shared/contract";

/** Paseo 主配置文件。Paseo 自己读它，我们改的也是它。 */
export function paseoConfigPath(): string {
  const dir = process.env.PASEO_HOME?.trim();
  return join(dir && dir.length > 0 ? dir : join(homedir(), ".paseo"), "config.json");
}

/** 备份文件保留个数。 */
const KEEP_BACKUPS = 5;
const BACKUP_MARK = ".bak-modelsync-";

type Json = Record<string, unknown>;

export async function readPaseoConfig(path: string): Promise<Json> {
  return JSON.parse(await readFile(path, "utf8")) as Json;
}

/** 从配置里取 claude 供应商当前的模型列表。 */
export function readClaudeModels(config: Json): SyncedModel[] | null {
  const agents = config.agents as { providers?: Record<string, unknown> } | undefined;
  const claude = agents?.providers?.claude as { models?: SyncedModel[] } | undefined;
  if (!claude || typeof claude !== "object") return null;
  return Array.isArray(claude.models) ? claude.models : [];
}

function sameModels(a: readonly SyncedModel[], b: readonly SyncedModel[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    return (
      right !== undefined &&
      left.id === right.id &&
      left.label === right.label &&
      Boolean(left.isDefault) === Boolean(right.isDefault)
    );
  });
}

/** 清掉多余的历史备份，只留最近几个。 */
async function pruneBackups(path: string): Promise<void> {
  const { readdir } = await import("node:fs/promises");
  const dir = join(path, "..");
  const base = path.split("/").pop() ?? "config.json";
  try {
    const entries = (await readdir(dir))
      .filter((name) => name.startsWith(base + BACKUP_MARK))
      .sort()
      .reverse();
    for (const stale of entries.slice(KEEP_BACKUPS)) {
      await unlink(join(dir, stale)).catch(() => {});
    }
  } catch {
    // 备份清理失败不影响主流程。
  }
}

export interface WriteResult {
  changed: boolean;
  message: string;
  backupPath: string | null;
}

/**
 * 把 models 写进 claude 供应商。
 *
 * 用 `models` 而不是 `additionalModels`：前者整体替换模型列表，Paseo 就不会再显示
 * 内置的那十几个模型。Paseo 的官方配置接口不支持 models，所以这里直接改文件。
 *
 * 写入方式：先备份 → 写临时文件 → 改名覆盖 → 权限沿用原文件。
 */
export async function writeClaudeModels(
  path: string,
  models: readonly SyncedModel[],
): Promise<WriteResult> {
  const raw = await readFile(path, "utf8");
  const config = JSON.parse(raw) as Json;

  const existing = readClaudeModels(config);
  if (existing === null) {
    return { changed: false, message: "Paseo 配置里没有 claude 供应商", backupPath: null };
  }
  if (sameModels(existing, models)) {
    return { changed: false, message: "已是最新", backupPath: null };
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "");
  const backupPath = `${path}${BACKUP_MARK}${stamp}`;
  await copyFile(path, backupPath);

  const claude = (config.agents as { providers: Record<string, Json> }).providers.claude;
  claude.models = models as unknown as Json;

  const mode = (await stat(path)).mode & 0o777;
  const tmp = `${path}.tmp-modelsync`;
  await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", { mode });
  await rename(tmp, path);

  await pruneBackups(path);

  return { changed: true, message: `已同步 ${models.length} 个模型`, backupPath };
}
