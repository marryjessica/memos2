import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { PlusIcon, XIcon } from "lucide-react";
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

    const {
        annotations,
        addAnnotation,
        deleteAnnotation,
        isAdding,
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
        <div className={cn("flex flex-col gap-2 w-full", className)}>
            {/* Editor */}
            {showEditor && (
                <div className="p-3 bg-muted/30 rounded-lg border border-border mt-2">
                    <Textarea
                        value={newAnnotation}
                        onChange={(e) => setNewAnnotation(e.target.value)}
                        placeholder="输入批注..."
                        className="min-h-[60px] text-sm resize-none mb-2"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancel}
                            className="h-7"
                        >
                            取消
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleAddAnnotation}
                            disabled={isAdding || !newAnnotation.trim()}
                            className="h-7"
                        >
                            发送
                        </Button>
                    </div>
                </div>
            )}

            {/* Annotations List */}
            <div className="space-y-3 pt-2">
                {annotations.map((annotation) => (
                    <div key={annotation.name} className="relative group bg-background p-3 rounded-lg border border-border shadow-sm text-sm">
                        {/* Connector Line Point (Visual anchor) */}
                        <div className="absolute top-4 -left-3 w-3 h-[1px] bg-border" />

                        <div className="flex justify-between items-start mb-1">
                            <span className="text-xs text-muted-foreground">
                                {annotation.createTime ? dayjs(timestampDate(annotation.createTime)).format("M/D HH:mm") : ""}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity -mr-1"
                                onClick={() => deleteAnnotation(annotation.name)}
                                disabled={isDeleting}
                            >
                                <XIcon className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            </Button>
                        </div>
                        <div className="prose prose-sm dark:prose-invert">
                            <MemoContent content={annotation.content} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Add button at bottom if list exists */}
            {!showEditor && annotations.length > 0 && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEditor(true)}
                    className="self-start text-xs text-muted-foreground opacity-0 hover:opacity-100 transition-opacity"
                >
                    <PlusIcon className="w-3 h-3 mr-1" />
                </Button>
            )}
        </div>
    );
};

export default MemoAnnotationSlot;
