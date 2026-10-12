import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { statusRpc, type SyncStatus } from "../shared/contract";

/** 检查间隔。文件变化由服务端感知，同步也由服务端执行，客户端只读状态、弹提示。 */
const POLL_MS = 5000;

export interface SyncState {
  status: SyncStatus | null;
  loading: boolean;
  error: string | null;
  /** 手动触发一次同步。 */
  sync: () => void;
}

/**
 * 轮询同步状态，在 changeSeq 增加时弹提示。
 *
 * 服务端读 settings.json 并直接写 Paseo 配置，客户端只展示和提示。
 */
export function useModelSync(
  onSynced: (message: string) => void,
  options: { watch: boolean } = { watch: true },
): SyncState {
  const readStatus = useRpc(statusRpc);

  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 用 ref 存回调，避免把 onSynced 放进 effect 依赖里导致循环重建。
  const notifyRef = useRef(onSynced);
  notifyRef.current = onSynced;
  const watchRef = useRef(options.watch);
  watchRef.current = options.watch;

  // 已见过的序号，避免同一次变更反复提示。
  const seenSeqRef = useRef(-1);
  const busyRef = useRef(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const next = await readStatus({});
        if (cancelled) return;
        setStatus(next);
        setError(null);

        // 只读模式（面板）不弹提示，避免和侧栏重复。
        if (!watchRef.current) return;

        const isNew = next.changeSeq > 0 && next.changeSeq > seenSeqRef.current;
        if (isNew) {
          seenSeqRef.current = next.changeSeq;
          if (next.state === "ok") notifyRef.current(next.message);
        } else {
          seenSeqRef.current = Math.max(seenSeqRef.current, next.changeSeq);
        }
      } catch (cause: unknown) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        busyRef.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const timer = setInterval(() => void run(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [readStatus, nonce]);

  return {
    status,
    loading,
    error,
    sync: () => setNonce((value) => value + 1),
  };
}
