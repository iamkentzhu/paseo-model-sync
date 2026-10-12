import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView, useToast } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { syncNowRpc } from "../shared/contract";
import { useModelSync } from "./use-sync";

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const STATE_TEXT: Record<string, string> = {
  idle: "尚未同步",
  ok: "已同步",
  skip: "跳过",
  error: "出错",
};

const STATE_COLOR = {
  idle: "foregroundMuted",
  ok: "statusSuccess",
  skip: "foregroundMuted",
  error: "statusDanger",
} as const;

/** 同步状态面板。 */
export function SyncScreen({ theme, layout, host }: PluginScreenProps) {
  const toast = useToast();
  // 面板只读：同步、提示都由常驻的侧栏项负责。这里的按钮只是显式触发一次。
  const sync = useModelSync(() => {}, { watch: false });
  const runSyncNow = useRpc(syncNowRpc);
  const [busy, setBusy] = useState(false);

  const syncNow = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runSyncNow({});
      const variant = next.state === "ok" ? "success" : next.state === "error" ? "error" : "info";
      toast.show(next.message, { variant });
      sync.sync();
    } catch (cause: unknown) {
      toast.error(`同步失败：${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: theme.colors.surface0,
        },
        content: {
          // 与 Paseo 原生页面一致的宽度约定：宽度自适应但不超过内容列宽，整体居中。
          // SDK 的 layout 没有内容宽度 token，只能写死；720 取自 Paseo 本体
          // （app-dist 里 `content: { width: "100%", maxWidth: 720, alignSelf: "center" }`）。
          maxWidth: 720,
          width: "100%",
          alignSelf: "center",
          padding: layout.compact ? 16 : 24,
          gap: 20,
          paddingBottom: 48,
        },
        card: {
          backgroundColor: theme.colors.surface1,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          overflow: "hidden",
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        rowLast: { borderBottomWidth: 0 },
        label: { color: theme.colors.foregroundMuted, fontSize: 13 },
        value: { color: theme.colors.foreground, fontSize: 13, flexShrink: 1, textAlign: "right" },
        modelRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
        modelId: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 },
        title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600", marginBottom: 8 },
        notice: { color: theme.colors.foregroundMuted, fontSize: 13, padding: 14, lineHeight: 19 },
        danger: { color: theme.colors.statusDanger, fontSize: 13, padding: 14 },
        hostRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: theme.colors.surface2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        hostLabel: { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" },
        hostId: { color: theme.colors.foregroundMuted, fontSize: 11 },
        button: {
          backgroundColor: theme.colors.accent,
          borderRadius: 8,
          paddingVertical: 11,
          alignItems: "center",
        },
        buttonText: { color: theme.colors.accentForeground, fontSize: 14, fontWeight: "600" },
      }),
    [theme, layout.compact],
  );

  const { status, loading, error } = sync;
  const models = status?.models ?? [];
  const stateColor = STATE_COLOR[status?.state ?? "idle"];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.title}>模型同步</Text>
        <View style={styles.card}>
          <View style={styles.hostRow}>
            <Text style={styles.hostLabel}>{host.label}</Text>
            <Text style={styles.hostId} numberOfLines={1}>
              {host.id}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>状态</Text>
            <Text style={[styles.value, { color: theme.colors[stateColor] }]}>
              {loading ? "检查中…" : STATE_TEXT[status?.state ?? "idle"]}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>数据来源</Text>
            <Text style={styles.value}>{status?.source ? status.source : "官方订阅"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>最近写入</Text>
            <Text style={styles.value}>{formatTime(status?.lastChangeAt ?? null)}</Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.label}>最近读取</Text>
            <Text style={styles.value}>{formatTime(status?.readAt ?? null)}</Text>
          </View>
        </View>
      </View>

      <View>
        <Text style={styles.title}>
          {models.length > 0 ? `已同步 ${models.length} 个模型` : "模型"}
        </Text>
        <View style={styles.card}>
          {models.length > 0 ? (
            models.map((model, index) => (
              <View
                key={model.id}
                style={[
                  styles.modelRow,
                  index === models.length - 1 ? styles.rowLast : null,
                ]}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>
                  {model.label}
                  {model.isDefault ? "　默认" : ""}
                </Text>
                <Text style={styles.modelId}>{model.id}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.notice}>{status?.message ?? "尚未读取"}</Text>
          )}
        </View>
      </View>

      {error ? (
        <View style={styles.card}>
          <Text style={styles.danger}>{error}</Text>
        </View>
      ) : null}

      {status?.state === "skip" && models.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.notice}>{status.message}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={[styles.button, busy ? { opacity: 0.5 } : null]}
        onPress={() => void syncNow()}
      >
        <Text style={styles.buttonText}>{busy ? "同步中…" : "立即同步"}</Text>
      </Pressable>
    </ScrollView>
  );
}
