import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { MessageSquareIcon, PlusIcon, SendIcon, TrashIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import MemoContent from "@/components/MemoContent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAnnotations } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface MemoAnnotationPanelProps {
    /** The memo to show annotations for */
    memo: Memo;
    /** Whether the panel is open */
    open: boolean;
    /** Callback when panel should close */
    onClose?: () => void;
    /** Additional CSS classes */
    className?: string;
}

/**
 * MemoAnnotationPanel displays annotations (comments) for a memo
 * in a sidebar panel, similar to Word's comment feature
 */
const MemoAnnotationPanel = ({
    memo,
    open,
    onClose,
    className,
}: MemoAnnotationPanelProps) => {
    const [newAnnotation, setNewAnnotation] = useState("");
    const [showEditor, setShowEditor] = useState(false);

    const {
        annotations,
        count,
        isLoading,
        addAnnotation,
        deleteAnnotation,
        isAdding,
        isDeleting,
    } = useAnnotations(memo.name);

    const handleAddAnnotation = async () => {
        if (!newAnnotation.trim()) {
            toast.error("批注内容不能为空");
            return;
        }

        try {
            await addAnnotation(newAnnotation.trim());
            setNewAnnotation("");
            setShowEditor(false);
            toast.success("批注已添加");
        } catch {
            toast.error("添加批注失败");
        }
    };

    const handleDeleteAnnotation = async (annotationName: string) => {
        try {
            await deleteAnnotation(annotationName);
            toast.success("批注已删除");
        } catch {
            toast.error("删除批注失败");
        }
    };

    if (!open) {
        return null;
    }

    return (
        <div
            className={cn(
                "fixed right-0 top-0 h-full w-80 bg-card border-l border-border shadow-lg z-40",
                "flex flex-col transition-transform duration-200",
                open ? "translate-x-0" : "translate-x-full",
                className
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <MessageSquareIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">批注</span>
                    {count > 0 && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {count}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setShowEditor(true)}
                    >
                        <PlusIcon className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={onClose}
                    >
                        <XIcon className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Add Annotation Editor */}
            {showEditor && (
                <div className="p-3 border-b border-border bg-muted/30">
                    <Textarea
                        value={newAnnotation}
                        onChange={(e) => setNewAnnotation(e.target.value)}
                        placeholder="输入批注内容... (支持 Markdown)"
                        className="min-h-[80px] text-sm resize-none"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setShowEditor(false);
                                setNewAnnotation("");
                            }}
                        >
                            取消
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleAddAnnotation}
                            disabled={isAdding || !newAnnotation.trim()}
                        >
                            <SendIcon className="w-3 h-3 mr-1" />
                            发送
                        </Button>
                    </div>
                </div>
            )}

            {/* Annotations List */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <span className="text-sm text-muted-foreground">加载中...</span>
                    </div>
                ) : annotations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <MessageSquareIcon className="w-8 h-8 text-muted-foreground/50 mb-2" />
                        <span className="text-sm text-muted-foreground">暂无批注</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => setShowEditor(true)}
                        >
                            <PlusIcon className="w-4 h-4 mr-1" />
                            添加批注
                        </Button>
                    </div>
                ) : (
                    <div className="p-2 space-y-2">
                        {annotations.map((annotation) => (
                            <AnnotationCard
                                key={annotation.name}
                                annotation={annotation}
                                onDelete={() => handleDeleteAnnotation(annotation.name)}
                                isDeleting={isDeleting}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Single annotation card component
 */
interface AnnotationCardProps {
    annotation: Memo;
    onDelete: () => void;
    isDeleting: boolean;
}

const AnnotationCard = ({ annotation, onDelete, isDeleting }: AnnotationCardProps) => {
    const [showDelete, setShowDelete] = useState(false);

    const timeStr = annotation.createTime
        ? dayjs(timestampDate(annotation.createTime)).format("M/D HH:mm")
        : "";

    return (
        <div
            className="group relative p-3 rounded-lg border border-border bg-background hover:bg-accent/30 transition-colors"
            onMouseEnter={() => setShowDelete(true)}
            onMouseLeave={() => setShowDelete(false)}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{timeStr}</span>
                {showDelete && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-60 hover:opacity-100"
                        onClick={onDelete}
                        disabled={isDeleting}
                    >
                        <TrashIcon className="w-3 h-3 text-destructive" />
                    </Button>
                )}
            </div>

            {/* Content */}
            <div className="text-sm">
                <MemoContent content={annotation.content} />
            </div>
        </div>
    );
};

export default MemoAnnotationPanel;
