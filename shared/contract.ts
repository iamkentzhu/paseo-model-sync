import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** 一个同步进 Paseo 的模型。 */
export const syncedModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  isDefault: z.boolean().optional(),
});

export type SyncedModel = z.infer<typeof syncedModelSchema>;

/** 一次同步的结果，供面板展示和提示判断。 */
export const syncStatusSchema = z.object({
  /** idle：还没跑过；ok：已同步；skip：条件不满足；error：出错。 */
  state: z.enum(["idle", "ok", "skip", "error"]),
  /** 直接显示给用户的话。 */
  message: z.string(),
  /** 三方服务商地址；官方订阅时为空串。 */
  source: z.string(),
  /** 当前 settings.json 里应同步的模型。 */
  models: z.array(syncedModelSchema),
  /** 最近一次读取 settings.json 的时间。 */
  readAt: z.string().nullable(),
  /** 最近一次真正改动 Paseo 配置的时间。 */
  lastChangeAt: z.string().nullable(),
  /** 每次真正改动 +1；客户端据此判断是否弹提示。 */
  changeSeq: z.number().int(),
});

export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const initialStatus: SyncStatus = {
  state: "idle",
  message: "尚未同步",
  source: "",
  models: [],
  readAt: null,
  lastChangeAt: null,
  changeSeq: 0,
};

/** 读当前状态。 */
export const statusRpc = defineRpc({
  name: "modelsync.status",
  input: z.object({}),
  output: syncStatusSchema,
});

/** 立刻检查并同步一次。 */
export const syncNowRpc = defineRpc({
  name: "modelsync.sync",
  input: z.object({}),
  output: syncStatusSchema,
});
