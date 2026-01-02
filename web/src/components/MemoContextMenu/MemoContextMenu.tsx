import {
    CopyIcon,
    Edit3Icon,
    ExternalLinkIcon,
    MessageSquarePlusIcon,
    TrashIcon,
} from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

interface MemoContextMenuProps {
    /** The memo data */
    memo: Memo;
    /** Children to wrap with context menu */
    children: React.ReactNode;
    /** Whether the memo is readonly */
    readonly?: boolean;
    /** Callback when edit is clicked */
    onEdit?: () => void;
    /** Callback when add annotation is clicked */
    onAddAnnotation?: () => void;
    /** Callback when copy link is clicked */
    onCopyLink?: () => void;
    /** Callback when goto detail is clicked */
    onGotoDetail?: () => void;
    /** Callback when delete is clicked */
    onDelete?: () => void;
    /** Additional CSS classes */
    className?: string;
}

/**
 * MemoContextMenu provides right-click context menu for memo items
 * with common actions like edit, annotate, copy, and delete
 */
const MemoContextMenu = ({
    memo,
    children,
    readonly = false,
    onEdit,
    onAddAnnotation,
    onCopyLink,
    onGotoDetail,
    onDelete,
    className,
}: MemoContextMenuProps) => {
    const t = useTranslate();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [contextMenuOpen, setContextMenuOpen] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenuPosition({ x: e.clientX, y: e.clientY });
        setContextMenuOpen(true);
    };

    const handleEdit = () => {
        setContextMenuOpen(false);
        onEdit?.();
    };

    const handleAddAnnotation = () => {
        setContextMenuOpen(false);
        onAddAnnotation?.();
    };

    const handleCopyLink = () => {
        setContextMenuOpen(false);
        // Copy memo link to clipboard
        const memoUrl = `${window.location.origin}/${memo.name}`;
        navigator.clipboard.writeText(memoUrl);
        onCopyLink?.();
    };

    const handleGotoDetail = () => {
        setContextMenuOpen(false);
        onGotoDetail?.();
    };

    const handleDeleteClick = () => {
        setContextMenuOpen(false);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        await onDelete?.();
        setDeleteDialogOpen(false);
    };

    return (
        <>
            <div
                className={cn("relative", className)}
                onContextMenu={handleContextMenu}
            >
                {children}
            </div>

            <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
                <DropdownMenuTrigger asChild>
                    {/* Invisible trigger positioned at click location */}
                    <div
                        className="fixed w-0 h-0"
                        style={{
                            left: contextMenuPosition.x,
                            top: contextMenuPosition.y,
                        }}
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    side="right"
                    sideOffset={0}
                    alignOffset={0}
                >
                    {/* Edit */}
                    {!readonly && (
                        <DropdownMenuItem onClick={handleEdit}>
                            <Edit3Icon className="w-4 h-4" />
                            {t("common.edit")}
                        </DropdownMenuItem>
                    )}

                    {/* Add Annotation */}
                    {!readonly && (
                        <DropdownMenuItem onClick={handleAddAnnotation}>
                            <MessageSquarePlusIcon className="w-4 h-4" />
                            添加批注
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {/* View Detail */}
                    <DropdownMenuItem onClick={handleGotoDetail}>
                        <ExternalLinkIcon className="w-4 h-4" />
                        查看详情
                    </DropdownMenuItem>

                    {/* Copy Link */}
                    <DropdownMenuItem onClick={handleCopyLink}>
                        <CopyIcon className="w-4 h-4" />
                        {t("memo.copy-link")}
                    </DropdownMenuItem>

                    {!readonly && (
                        <>
                            <DropdownMenuSeparator />

                            {/* Delete */}
                            <DropdownMenuItem onClick={handleDeleteClick} className="text-destructive">
                                <TrashIcon className="w-4 h-4" />
                                {t("common.delete")}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Delete confirmation dialog */}
            <ConfirmDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                title={t("memo.delete-confirm")}
                confirmLabel={t("common.delete")}
                description={t("memo.delete-confirm-description")}
                cancelLabel={t("common.cancel")}
                onConfirm={confirmDelete}
                confirmVariant="destructive"
            />
        </>
    );
};

export default MemoContextMenu;
