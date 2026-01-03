import { memo, useMemo, useRef, useState } from "react";
import { useUser } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import MemoEditor from "../MemoEditor";
import PreviewImageDialog from "../PreviewImageDialog";
import { MemoBody, MemoHeader } from "./components";
import { MEMO_CARD_BASE_CLASSES } from "./constants";
import { useImagePreview, useKeyboardShortcuts, useMemoActions, useMemoHandlers, useMemoViewDerivedState, useNsfwContent } from "./hooks";
import { MemoViewContext } from "./MemoViewContext";
import type { MemoViewProps } from "./types";

/**
 * MemoView component displays a memo card with all its content, metadata, and interactive elements.
 *
 * Features:
 * - Displays memo content with markdown rendering
 * - Shows creator information and timestamps
 * - Supports inline editing with keyboard shortcuts (e = edit, a = archive)
 * - Handles NSFW content blurring
 * - Image preview on click
 * - Comments, reactions, and relations
 *
 * @example
 * ```tsx
 * <MemoView
 *   memo={memoData}
 *   showCreator
 *   showVisibility
 *   compact={false}
 * />
 * ```
 */
const MemoView: React.FC<MemoViewProps> = (props: MemoViewProps) => {
  const { memo: memoData, className } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  const [reactionSelectorOpen, setReactionSelectorOpen] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const creator = useUser(memoData.creator).data;
  const { isArchived, readonly, parentPage } = useMemoViewDerivedState(memoData, props.parentPage);
  const { nsfw, showNSFWContent, toggleNsfwVisibility } = useNsfwContent(memoData, props.showNsfwContent);
  const { previewState, openPreview, setPreviewOpen } = useImagePreview();
  const { archiveMemo, unpinMemo } = useMemoActions(memoData, isArchived);

  const handleEditorConfirm = () => setShowEditor(false);
  const handleEditorCancel = () => setShowEditor(false);
  const openEditor = () => setShowEditor(true);

  const { handleGotoMemoDetailPage, handleMemoContentClick, handleMemoContentDoubleClick } = useMemoHandlers({
    memoName: memoData.name,
    parentPage,
    readonly,
    openEditor,
    openPreview,
  });
  useKeyboardShortcuts(cardRef, {
    enabled: true,
    readonly,
    showEditor,
    isArchived,
    onEdit: openEditor,
    onArchive: archiveMemo,
  });

  const contextValue = useMemo(
    () => ({
      memo: memoData,
      creator,
      parentPage,
      showNSFWContent,
      nsfw,
    }),
    [memoData, creator, parentPage, showNSFWContent, nsfw],
  );

  if (showEditor) {
    return (
      <MemoEditor
        autoFocus
        className="mb-2"
        cacheKey={`inline-memo-editor-${memoData.name}`}
        memoName={memoData.name}
        onConfirm={handleEditorConfirm}
        onCancel={handleEditorCancel}
      />
    );
  }

  return (
    <MemoViewContext.Provider value={contextValue}>
      <article className={cn(MEMO_CARD_BASE_CLASSES, className)} ref={cardRef} tabIndex={readonly ? -1 : 0}>
        {/* Horizontal layout: Content on left, Actions on right (aligned to first line) */}
        <div className="w-full flex flex-row items-start justify-between gap-3">
          {/* Left: Content (grows to fill space) */}
          <div className="flex-1 min-w-0">
            <MemoBody
              compact={props.compact}
              onContentClick={handleMemoContentClick}
              onContentDoubleClick={handleMemoContentDoubleClick}
              onToggleNsfwVisibility={toggleNsfwVisibility}
            />
          </div>

          {/* Right: Actions (aligned to first line) */}
          <div className="flex-shrink-0">
            <MemoHeader
              showCreator={false}
              showVisibility={props.showVisibility}
              showPinned={props.showPinned}
              onEdit={openEditor}
              onGotoDetail={handleGotoMemoDetailPage}
              onUnpin={unpinMemo}
              onToggleNsfwVisibility={toggleNsfwVisibility}
              onAddAnnotation={props.onAddAnnotation}
              reactionSelectorOpen={reactionSelectorOpen}
              onReactionSelectorOpenChange={setReactionSelectorOpen}
            />
          </div>
        </div>

        <PreviewImageDialog
          open={previewState.open}
          onOpenChange={setPreviewOpen}
          imgUrls={previewState.urls}
          initialIndex={previewState.index}
        />
      </article>
    </MemoViewContext.Provider>
  );
};

export default memo(MemoView);
