import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SyncScreen } from "./client/screen";
import { SyncSidebarItem } from "./client/sidebar-item";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "sync", title: "模型同步", Component: SyncScreen });
  client.addSidebarHeaderItem({
    id: "model-sync",
    title: "模型同步",
    Component: SyncSidebarItem,
  });

  client.addCommandCenterItem({
    id: "model-sync-open",
    title: "模型同步",
    icon: "RefreshCw",
    keywords: ["claude", "模型", "同步", "models"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "sync" });
    },
  });

  return () => {};
}
