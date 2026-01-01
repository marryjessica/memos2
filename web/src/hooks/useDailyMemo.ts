import { create } from "@bufbuild/protobuf";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { memoServiceClient } from "@/connect";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { ListMemosRequestSchema } from "@/types/proto/api/v1/memo_service_pb";
import useCurrentUser from "./useCurrentUser";

// 日期格式：用于生成日期标题
export const DAILY_DATE_FORMAT = "YYYY-MM-DD";
export const DAILY_TITLE_PREFIX = "# ";

/**
 * 生成每日 Memo 的标题
 * @param date 日期，默认今天
 */
export function getDailyTitle(date: Date = new Date()): string {
  return `${DAILY_TITLE_PREFIX}${dayjs(date).format(DAILY_DATE_FORMAT)}`;
}

/**
 * 检查 Memo 内容是否以指定日期标题开头
 */
export function isDailyMemoForDate(memo: Memo, date: Date = new Date()): boolean {
  const title = getDailyTitle(date);
  return memo.content.trim().startsWith(title);
}

/**
 * 提取用户名中的 user ID
 */
function extractUserIdFromName(name: string): string {
  const match = name.match(/users\/(\d+)/);
  return match ? match[1] : "";
}

// Query key factory
export const dailyMemoKeys = {
  all: ["daily-memo"] as const,
  byDate: (date: string) => [...dailyMemoKeys.all, date] as const,
};

/**
 * Hook: 获取指定日期的每日 Memo
 * @param date 日期，默认今天
 */
export function useDailyMemo(date: Date = new Date()) {
  const user = useCurrentUser();
  const dateStr = dayjs(date).format(DAILY_DATE_FORMAT);

  return useQuery({
    queryKey: dailyMemoKeys.byDate(dateStr),
    queryFn: async () => {
      if (!user?.name) return null;

      // 获取用户 ID
      const userId = extractUserIdFromName(user.name);
      if (!userId) return null;

      // 构建日期范围过滤器（Unix 时间戳，秒级）
      // 注意：后端使用 created_ts 字段存储 Unix 时间戳
      const startOfDayTs = Math.floor(dayjs(date).startOf("day").valueOf() / 1000);
      const endOfDayTs = startOfDayTs + 86400; // 加一天的秒数

      // 使用 CEL 过滤器查询当天创建的 Memo
      // 语法参考：web/src/hooks/useMemoFilters.ts
      const filter = `creator_id == ${userId} && created_ts >= ${startOfDayTs} && created_ts < ${endOfDayTs}`;

      const response = await memoServiceClient.listMemos(
        create(ListMemosRequestSchema, {
          filter,
          pageSize: 100,
        } as Record<string, unknown>),
      );

      // 在返回的 Memo 中查找以日期标题开头的那个
      const dailyMemo = response.memos.find((memo) => isDailyMemoForDate(memo, date));
      return dailyMemo || null;
    },
    enabled: !!user?.name,
    staleTime: 1000 * 30, // 30 秒内认为缓存有效
    gcTime: 1000 * 60 * 5, // 5 分钟后清理缓存
  });
}

/**
 * Hook: 使缓存失效
 */
export function useInvalidateDailyMemo() {
  const queryClient = useQueryClient();

  return (date: Date = new Date()) => {
    const dateStr = dayjs(date).format(DAILY_DATE_FORMAT);
    queryClient.invalidateQueries({ queryKey: dailyMemoKeys.byDate(dateStr) });
  };
}
