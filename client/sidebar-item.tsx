import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useModelSync } from "./use-sync";

/**
 * 常驻的侧栏项。
 *
 * 它挂在侧栏上，只要 Paseo 开着就一直存在 —— 同步循环借这里跑，
 * 真正改动配置时弹一条应用内提示。
 */
export function SyncSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const toast = useToast();
  useModelSync((message) => toast.show(message, { variant: "success", durationMs: 3600 }));

  return (
    <SidebarRow
      icon="RefreshCw"
      label="模型同步"
      active={currentScreen?.screenId === "sync"}
      onPress={() => openScreen({ screenId: "sync" })}
    />
  );
}
