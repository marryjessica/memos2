import dayjs from "dayjs";
import DailyMemoGroup from "@/components/DailyMemoGroup";
import { useGroupedMemos } from "@/hooks/useGroupedMemos";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface DailyMemoListProps {
  /** List of memos to render */
  memos: Memo[];
  /** Renderer function for individual memos */
  renderer: (memo: Memo) => JSX.Element;
  /** Optional prefix element (e.g., editor, filters) */
  prefixElement?: React.ReactNode;
  /** Callback for quick add on today's group */
  onQuickAdd?: () => void;
}

/**
 * DailyMemoList renders memos grouped by date
 * Each day gets its own collapsible card with stats
 */
const DailyMemoList = ({ memos, renderer, prefixElement, onQuickAdd }: DailyMemoListProps) => {
  const groups = useGroupedMemos(memos);
  const todayKey = dayjs().format("YYYY-MM-DD");

  return (
    <div className="w-full flex flex-col gap-3">
      {prefixElement}

      {groups.map((group) => (
        <DailyMemoGroup
          key={group.date}
          group={group}
          renderMemo={renderer}
          isToday={group.date === todayKey}
          showQuickAdd={group.date === todayKey}
          onQuickAdd={onQuickAdd}
          defaultExpanded={true}
        />
      ))}
    </div>
  );
};

export default DailyMemoList;
