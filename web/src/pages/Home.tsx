import { useState } from "react";
import { MemoRenderContext } from "@/components/MasonryView";
import MemoAnnotationSlot from "@/components/MemoAnnotationSlot";
import MemoContextMenu from "@/components/MemoContextMenu";
import MemoView from "@/components/MemoView";
import PagedMemoList from "@/components/PagedMemoList";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useDeleteMemo } from "@/hooks/useMemoQueries";
import useNavigateTo from "@/hooks/useNavigateTo";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

const Home = () => {
  const user = useCurrentUser();
  const navigateTo = useNavigateTo();
  const deleteMemo = useDeleteMemo();

  // ID of the memo currently focused for adding annotation
  const [activeAnnotationMemoId, setActiveAnnotationMemoId] = useState<string | null>(null);

  // Build filter using unified hook
  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeShortcuts: true,
    includePinned: true,
  });

  // Get sorting logic using unified hook
  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  // Handle adding annotation (triggered from Context Menu)
  const handleAddAnnotationTrigger = (memo: Memo) => {
    setActiveAnnotationMemoId(memo.name);
  };

  // Handle focus dismiss from Slot
  const handleFocusDismiss = () => {
    setActiveAnnotationMemoId(null);
  };

  // Handle memo deletion
  const handleDeleteMemo = async (memoName: string) => {
    await deleteMemo.mutateAsync(memoName);
  };

  // Render memo row with annotations (3-column layout)
  const renderAnnotatedMemoRow = (memo: Memo, context?: MemoRenderContext) => {
    const isActive = activeAnnotationMemoId === memo.name;

    return (
      <div className="grid grid-cols-[1fr_300px] gap-0 relative items-start group/row">
        {/* Column 1: Memo Card */}
        <MemoContextMenu
          key={`context-${memo.name}`}
          memo={memo}
          onAddAnnotation={() => handleAddAnnotationTrigger(memo)}
          onGotoDetail={() => navigateTo(`/${memo.name}`)}
          onDelete={() => handleDeleteMemo(memo.name)}
        >
          <MemoView
            key={`${memo.name}-${memo.displayTime}`}
            memo={memo}
            showVisibility
            showPinned
            compact={context?.compact}
            onAddAnnotation={() => handleAddAnnotationTrigger(memo)}
          />
        </MemoContextMenu>

        {/* Column 2: Annotation Slot (contains annotations and editor) */}
        <div className="relative">
          {/* Visual Connector Line (Pseudo-line from Memo to Slot) */}
          {/* Only show if slot has content or is active? User said "connected by a line". */}
          {/* We used a line inside MemoAnnotationSlot, but a spanning line here is also good */}
          <div className="hidden absolute top-6 -left-8 w-8 border-t border-red-400 border-dashed pointer-events-none" />

          <MemoAnnotationSlot memo={memo} isFocused={isActive} onFocusDismiss={handleFocusDismiss} />
        </div>
      </div>
    );
  };

  return (
    <div className="w-full min-h-full bg-background text-foreground">
      <PagedMemoList renderer={renderAnnotatedMemoRow} listSort={listSort} orderBy={orderBy} filter={memoFilter} groupByDate={true} />
    </div>
  );
};

export default Home;
