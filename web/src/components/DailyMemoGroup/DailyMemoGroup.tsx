import { CalendarIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DailyGroup } from "@/hooks/useGroupedMemos";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface DailyMemoGroupProps {
    /** The daily group data */
    group: DailyGroup;
    /** Renderer function for individual memos */
    renderMemo: (memo: Memo) => React.ReactNode;
    /** Whether to show quick add input */
    showQuickAdd?: boolean;
    /** Callback when quick add is triggered */
    onQuickAdd?: () => void;
    /** Additional CSS classes */
    className?: string;
    /** Whether this is "today" group - shows special styling */
    isToday?: boolean;
    /** Default expanded state */
    defaultExpanded?: boolean;
}

/**
 * DailyMemoGroup displays a group of memos for a single day
 * with collapsible functionality and task statistics
 */
const DailyMemoGroup = ({
    group,
    renderMemo,
    showQuickAdd = false,
    onQuickAdd,
    className,
    isToday = false,
    defaultExpanded = true,
}: DailyMemoGroupProps) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const totalTasks = group.incompleteCount + group.completeCount;
    const hasTaskStats = totalTasks > 0;

    return (
        <div
            className={cn(
                "w-full rounded-lg border transition-all duration-200",
                isToday
                    ? "border-primary/30 bg-primary/5 shadow-sm"
                    : "border-border bg-card",
                className
            )}
        >
            {/* Header */}
            <div
                className={cn(
                    "flex items-center justify-between px-4 py-3 cursor-pointer select-none",
                    "hover:bg-accent/50 transition-colors rounded-t-lg",
                    !isExpanded && "rounded-b-lg"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    {/* Expand/Collapse Icon */}
                    <button
                        className="p-0.5 hover:bg-accent rounded transition-colors"
                        aria-label={isExpanded ? "收起" : "展开"}
                    >
                        {isExpanded ? (
                            <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                        ) : (
                            <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                    </button>

                    {/* Date Icon & Label */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                    <CalendarIcon className={cn(
                                        "w-4 h-4",
                                        isToday ? "text-primary" : "text-muted-foreground"
                                    )} />
                                    <span className={cn(
                                        "font-medium text-sm",
                                        isToday ? "text-primary" : "text-foreground"
                                    )}>
                                        {group.displayDate}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{group.fullDate}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {/* Memo Count Badge */}
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {group.memos.length} 条
                    </span>
                </div>

                {/* Right Side: Task Stats & Actions */}
                <div className="flex items-center gap-3">
                    {/* Task Statistics */}
                    {hasTaskStats && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {group.completeCount > 0 && (
                                <span className="text-green-600 dark:text-green-400">
                                    ✓ {group.completeCount}
                                </span>
                            )}
                            {group.incompleteCount > 0 && (
                                <span className="text-amber-600 dark:text-amber-400">
                                    ○ {group.incompleteCount}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Quick Add Button (for today) */}
                    {showQuickAdd && isToday && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={(e) => {
                                e.stopPropagation();
                                onQuickAdd?.();
                            }}
                        >
                            <PlusIcon className="w-4 h-4 mr-1" />
                            添加
                        </Button>
                    )}
                </div>
            </div>

            {/* Content - Memo List */}
            {isExpanded && (
                <div className="px-4 pb-3 space-y-2">
                    {group.memos.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm">
                            暂无待办
                        </div>
                    ) : (
                        group.memos.map((memo) => (
                            <div key={memo.name}>
                                {renderMemo(memo)}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default DailyMemoGroup;
