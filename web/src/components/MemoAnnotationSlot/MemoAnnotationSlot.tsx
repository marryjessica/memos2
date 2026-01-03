import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { Edit3Icon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import MemoContent from "@/components/MemoContent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAnnotations } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";

interface MemoAnnotationSlotProps {
    memo: Memo;
    className?: string;
    isFocused?: boolean;
    onFocusDismiss?: () => void;
}

const MemoAnnotationSlot = ({ memo, className, isFocused, onFocusDismiss }: MemoAnnotationSlotProps) => {
    const [newAnnotation, setNewAnnotation] = useState("");
    const [showEditor, setShowEditor] = useState(false);

    // Open editor when isFocused prop becomes true
    useEffect(() => {
        if (isFocused) {
            setShowEditor(true);
        }
    }, [isFocused]);

    const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState("");

    const {
        annotations,
        addAnnotation,
        updateAnnotation,
        deleteAnnotation,
        isAdding,
        isUpdating,
        isDeleting,
    } = useAnnotations(memo.name);

    const handleAddAnnotation = async () => {
        if (!newAnnotation.trim()) {
            return;
        }
        try {
            await addAnnotation(newAnnotation.trim());
            setNewAnnotation("");
            setShowEditor(false);
            onFocusDismiss?.();
            toast.success("批注已添加");
        } catch {
            toast.error("添加批注失败");
        }
    };

    const handleUpdateAnnotation = async (id: string) => {
        if (!editingContent.trim()) return;
        try {
            await updateAnnotation({ name: id, content: editingContent.trim() });
            setEditingAnnotationId(null);
            setEditingContent("");
            toast.success("批注已更新");
        } catch {
            toast.error("更新批注失败");
        }
    };

    const startEditing = (annotation: Memo) => {
        setEditingAnnotationId(annotation.name);
        setEditingContent(annotation.content);
    };

    const handleCancel = () => {
        setShowEditor(false);
        setNewAnnotation("");
        onFocusDismiss?.();
    };

    if (annotations.length === 0 && !showEditor) {
        // Render an placeholder that allows adding on hover
        return (
            <div className={cn("w-full opacity-0 hover:opacity-100 transition-opacity duration-200", className)}>
                <Button variant="ghost" size="sm" onClick={() => setShowEditor(true)} className="text-muted-foreground text-xs">
                    <PlusIcon className="w-3 h-3 mr-1" />
                    添加批注
                </Button>
            </div>
        );
    }

    return (

        <div className={cn("flex flex-col gap-3 w-full pl-2", className)}>
            {/* Editor - Clean Minimal Style */}
            {showEditor && (
                <div className="relative group">
                    <div className="absolute top-3 -left-[13px] w-2 h-2 rounded-full bg-primary/20 ring-4 ring-background" />
                    <div className="bg-muted/30 rounded-lg border border-border/50 focus-within:border-primary/30 focus-within:bg-muted/50 transition-all">
                        <Textarea
                            value={newAnnotation}
                            onChange={(e) => setNewAnnotation(e.target.value)}
                            placeholder="写下你的想法..."
                            className="min-h-[80px] text-sm resize-none border-none focus-visible:ring-0 bg-transparent p-3"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 p-2 pt-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancel}
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                                取消
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleAddAnnotation}
                                disabled={isAdding || !newAnnotation.trim()}
                                className="h-6 px-3 text-xs"
                            >
                                发送
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Annotations List - Clean Marginalia Style */}
            <div className="space-y-4">
                {annotations.map((annotation) => (
                    <div key={annotation.name} className="relative group pl-3 transition-all">
                        {/* Visual Accent Bar (The "Marker") */}
                        <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-primary/20 group-hover:bg-primary/50 transition-colors" />

                        {/* Connector dot to main thread (optional flair) */}
                        <div className="absolute top-2.5 -left-[14px] w-1.5 h-1.5 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />

                        <div className="flex flex-col gap-1">
                            {/* Meta Header */}
                            <div className="flex justify-between items-center h-5">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                    {annotation.createTime ? dayjs(timestampDate(annotation.createTime)).format("HH:mm") : ""}
                                </span>
                                {editingAnnotationId !== annotation.name && (
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-all -mr-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 hover:bg-muted hover:text-primary"
                                            onClick={() => startEditing(annotation)}
                                        >
                                            <Edit3Icon className="w-3 h-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => deleteAnnotation(annotation.name)}
                                            disabled={isDeleting}
                                        >
                                            <XIcon className="w-3 h-3" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Content or Inline Editor */}
                            {editingAnnotationId === annotation.name ? (
                                <div className="bg-muted/30 rounded-lg border border-primary/20 p-2">
                                    <Textarea
                                        value={editingContent}
                                        onChange={(e) => setEditingContent(e.target.value)}
                                        className="min-h-[60px] text-sm resize-none border-none focus-visible:ring-0 bg-transparent p-1"
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingAnnotationId(null)}
                                            className="h-5 px-2 text-xs"
                                        >
                                            取消
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => handleUpdateAnnotation(annotation.name)}
                                            disabled={isUpdating || !editingContent.trim()}
                                            className="h-5 px-2 text-xs"
                                        >
                                            保存
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-foreground/90 leading-relaxed break-words" onDoubleClick={() => startEditing(annotation)}>
                                    <MemoContent content={annotation.content} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MemoAnnotationSlot;
