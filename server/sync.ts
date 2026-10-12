import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SyncedModel } from "../shared/contract";

/** 读 settings.json 的结果：要么算出该同步什么，要么说明为什么跳过。 */
export interface Desired {
  kind: "ok" | "skip";
  reason: string;
  source: string;
  models: SyncedModel[];
  fingerprint: string;
  readAt: string;
}

/** settings.json 里的键 → 默认模型优先级（越小越优先）。 */
const ROLE_KEYS: ReadonlyArray<readonly [string, number]> = [
  ["ANTHROPIC_MODEL", 0],
  ["ANTHROPIC_DEFAULT_OPUS_MODEL", 1],
  ["ANTHROPIC_DEFAULT_SONNET_MODEL", 2],
  ["ANTHROPIC_DEFAULT_FABLE_MODEL", 3],
  ["ANTHROPIC_DEFAULT_HAIKU_MODEL", 4],
];

export function settingsPath(): string {
  const dir = process.env.CLAUDE_CONFIG_DIR?.trim();
  return join(dir && dir.length > 0 ? dir : join(homedir(), ".claude"), "settings.json");
}

/** claude-opus-5-5[1M] → "Opus 5.5 (1M)"；claude-haiku-4-5-20251001 → "Haiku 4.5"。 */
export function prettyLabel(modelId: string): string {
  let core = modelId;
  let oneM = "";
  if (core.endsWith("[1M]")) {
    core = core.slice(0, -4);
    oneM = " (1M)";
  }

  const parts = core.split("-");
  if (parts[0]?.toLowerCase() === "claude") parts.shift();
  // 结尾 8 位日期是版本快照标记，不进显示名。
  const tailPart = parts[parts.length - 1];
  if (tailPart !== undefined && tailPart.length === 8 && /^\d+$/.test(tailPart)) parts.pop();

  const version: string[] = [];
  for (;;) {
    const last = parts[parts.length - 1];
    if (last === undefined || !/^\d+$/.test(last) || last.length > 2) break;
    version.unshift(last);
    parts.pop();
  }

  const family = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  const head = family.length > 0 ? family : "Model";
  const tail = version.join(".");
  return `${head}${tail.length > 0 ? ` ${tail}` : ""}${oneM}`;
}

function skip(reason: string, fingerprint: string): Desired {
  return {
    kind: "skip",
    reason,
    source: "",
    models: [],
    fingerprint,
    readAt: new Date().toISOString(),
  };
}

/**
 * 读 settings.json，算出应同步的模型。
 *
 * 判断条件刻意只看 settings.json，不读任何管理工具（CC Switch、Magpie 等）的私有文件：
 * 换工具也不用改。
 */
export async function readDesired(): Promise<Desired> {
  let text: string;
  try {
    text = await readFile(settingsPath(), "utf8");
  } catch {
    return skip("读不到 ~/.claude/settings.json", "missing");
  }

  const fingerprint = createHash("sha256").update(text).digest("hex").slice(0, 16);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return skip("settings.json 不是有效的 JSON", fingerprint);
  }

  const env = (raw as { env?: Record<string, unknown> } | null)?.env;
  if (!env || typeof env !== "object") return skip("settings.json 没有 env 段", fingerprint);

  const baseUrl = typeof env.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL.trim() : "";
  if (baseUrl.length === 0) {
    // 官方订阅：Paseo 自带模型清单更合适，不覆盖。
    return skip("未使用三方服务商（官方订阅）", fingerprint);
  }

  const found = new Map<string, number>();
  for (const [key, rank] of ROLE_KEYS) {
    const value = env[key];
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (id.length === 0 || found.has(id)) continue;
    found.set(id, rank);
  }
  if (found.size === 0) return skip("settings.json 里没有模型配置", fingerprint);

  const best = Math.min(...found.values());
  const models: SyncedModel[] = [];
  for (const [id, rank] of found) {
    models.push({ id, label: prettyLabel(id), ...(rank === best ? { isDefault: true } : {}) });
  }

  return {
    kind: "ok",
    reason: "",
    source: baseUrl,
    models,
    fingerprint,
    readAt: new Date().toISOString(),
  };
}

/** 两组模型是否一致（顺序、ID、标签、默认标记都比）。 */
export function sameModels(a: readonly SyncedModel[], b: readonly SyncedModel[]): boolean {
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
