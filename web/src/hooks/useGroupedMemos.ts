import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import isYesterday from "dayjs/plugin/isYesterday";
import { useMemo } from "react";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

// Extend dayjs with plugins
dayjs.extend(isToday);
dayjs.extend(isYesterday);

/**
 * Represents a group of memos for a specific date
 */
export interface DailyGroup {
  /** Date key in YYYY-MM-DD format */
  date: string;
  /** Human-readable display label (Today, Yesterday, Jan 2, etc.) */
  displayDate: string;
  /** Full date for tooltip */
  fullDate: string;
  /** Memos belonging to this date */
  memos: Memo[];
  /** Count of incomplete tasks */
  incompleteCount: number;
  /** Count of complete tasks */
  completeCount: number;
}

/**
 * Extract date string from Memo's displayTime
 */
function getMemoDateKey(memo: Memo): string {
  if (!memo.displayTime) {
    return dayjs().format("YYYY-MM-DD");
  }
  return dayjs(timestampDate(memo.displayTime)).format("YYYY-MM-DD");
}

/**
 * Generate human-readable date label
 */
function getDisplayDate(dateStr: string): string {
  const date = dayjs(dateStr);

  if (date.isToday()) {
    return "今天";
  }
  if (date.isYesterday()) {
    return "昨天";
  }

  // Same year: show "Jan 2"
  if (date.year() === dayjs().year()) {
    return date.format("M月D日");
  }

  // Different year: show full date
  return date.format("YYYY年M月D日");
}

/**
 * Count incomplete and complete tasks in a memo
 */
function countTasks(memo: Memo): { incomplete: number; complete: number } {
  const content = memo.content || "";
  const incompleteMatches = content.match(/- \[ \]/g);
  const completeMatches = content.match(/- \[x\]/gi);

  return {
    incomplete: incompleteMatches?.length || 0,
    complete: completeMatches?.length || 0,
  };
}

/**
 * Hook to group memos by display date
 *
 * @param memos - Array of memos to group
 * @returns Array of daily groups, sorted by date descending (newest first)
 *
 * @example
 * ```tsx
 * const groups = useGroupedMemos(memos);
 * // Returns:
 * // [
 * //   { date: "2026-01-02", displayDate: "Today", memos: [...] },
 * //   { date: "2026-01-01", displayDate: "Yesterday", memos: [...] },
 * // ]
 * ```
 */
export function useGroupedMemos(memos: Memo[]): DailyGroup[] {
  return useMemo(() => {
    // Group memos by date
    const groupMap = new Map<string, Memo[]>();

    for (const memo of memos) {
      const dateKey = getMemoDateKey(memo);
      const existing = groupMap.get(dateKey) || [];
      existing.push(memo);
      groupMap.set(dateKey, existing);
    }

    // Convert to array and sort by date descending
    const groups: DailyGroup[] = Array.from(groupMap.entries())
      .map(([date, memos]) => {
        // Count tasks across all memos in this group
        let incompleteCount = 0;
        let completeCount = 0;

        for (const memo of memos) {
          const { incomplete, complete } = countTasks(memo);
          incompleteCount += incomplete;
          completeCount += complete;
        }

        return {
          date,
          displayDate: getDisplayDate(date),
          fullDate: dayjs(date).format("YYYY年M月D日 dddd"),
          memos,
          incompleteCount,
          completeCount,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // Descending order

    return groups;
  }, [memos]);
}

/**
 * Hook to get today's memos from grouped data
 */
export function useTodayMemos(groups: DailyGroup[]): Memo[] {
  const todayKey = dayjs().format("YYYY-MM-DD");
  return groups.find((g) => g.date === todayKey)?.memos || [];
}
