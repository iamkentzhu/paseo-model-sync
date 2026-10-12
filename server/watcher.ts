import { watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** 防抖窗口。管理工具分多步写 settings.json，等它写完再读。 */
export const DEBOUNCE_MS = 2000;

export function settingsDir(): string {
  const dir = process.env.CLAUDE_CONFIG_DIR?.trim();
  return dir && dir.length > 0 ? dir : join(homedir(), ".claude");
}

/**
 * 监听 settings.json 的改动。
 *
 * 监听目录而不是文件：多数工具用「写临时文件再改名」的方式保存，
 * 直接监听文件会在第一次替换后失效。只把 settings.json 的事件算数。
 */
export function watchSettings(onChange: () => void): () => void {
  const target = "settings.json";
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, DEBOUNCE_MS);
  };

  try {
    watcher = watch(settingsDir(), (_eventType, filename) => {
      if (filename === null || filename === target) schedule();
    });
  } catch {
    return () => {};
  }

  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
