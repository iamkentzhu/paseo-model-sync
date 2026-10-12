import { execCommand } from "@getpaseo/plugin/server";

/** Paseo CLI 通常不在登录 shell 的 PATH 里，装 App 时只放在 bundle 内。 */
const CANDIDATES = [
  "paseo",
  "/Applications/Paseo.app/Contents/Resources/bin/paseo",
];

let resolved: string | null | undefined;
let queue: Promise<unknown> = Promise.resolve();

async function resolveCli(): Promise<string | null> {
  if (resolved !== undefined) return resolved;
  for (const candidate of CANDIDATES) {
    try {
      const { stdout } = await execCommand(candidate, ["--version"], { timeout: 10_000 });
      if (stdout.trim().length > 0) {
        resolved = candidate;
        return candidate;
      }
    } catch {
      // 继续试下一个候选路径。
    }
  }
  resolved = null;
  return null;
}

export interface ReloadResult {
  ok: boolean;
  message: string;
}

/**
 * 让 Paseo 重新读 config.json。
 *
 * `reload` 只重载配置，不重启 daemon —— 插件服务端因此不会被自己触发重启。
 * 写盘后稍等一拍再 reload，避开 Paseo 侧读文件与写入的竞态。
 */
export async function paseoReload(): Promise<ReloadResult> {
  const run = async (): Promise<ReloadResult> => {
    const cli = await resolveCli();
    if (cli === null) {
      return { ok: false, message: "找不到 paseo CLI，配置已写入但需手动重载" };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await execCommand(cli, ["reload"], { timeout: 20_000 });
      return { ok: true, message: "已通知 Paseo 重载配置" };
    } catch (error) {
      return { ok: false, message: `paseo reload 失败：${String(error)}` };
    }
  };

  // 串行化：连点手动同步时不会并发 reload。
  queue = queue.then(run, run);
  return (await queue) as ReloadResult;
}
