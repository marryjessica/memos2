import { create } from "@bufbuild/protobuf";
import { memoServiceClient } from "@/connect";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";
import type { EditorState } from "../state";
import { uploadService } from "./uploadService";

/**
 * 格式化内容为待办事项
 * 在第一行开头添加 checkbox，多行内容保持为一个整体
 */
function formatAsTodo(content: string): string {
    const trimmed = content.trim();

    // 空内容返回原样
    if (!trimmed) {
        return trimmed;
    }

    // 如果已经是待办格式，直接返回
    if (trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")) {
        return trimmed;
    }

    // 如果以 - 开头（普通列表项），转换为待办
    if (trimmed.startsWith("- ")) {
        return `- [ ] ${trimmed.slice(2)}`;
    }

    // 如果以 * 开头，也转换为待办
    if (trimmed.startsWith("* ")) {
        return `- [ ] ${trimmed.slice(2)}`;
    }

    // 其他情况，添加待办前缀（整体作为一个任务）
    return `- [ ] ${trimmed}`;
}

export interface AtomicSaveResult {
    /** Name of the created memo */
    memoName: string;
    /** Whether any changes were made */
    hasChanges: boolean;
}

export const atomicMemoService = {
    /**
     * 原子化保存待办
     * 简化逻辑：将内容格式化为单个待办，不拆分多行
     */
    async save(
        state: EditorState,
        options: {
            enableAtomicMode?: boolean;
        } = {},
    ): Promise<{ memoNames: string[]; count: number; hasChanges: boolean }> {
        // 如果未启用原子化模式，返回空结果
        if (!options.enableAtomicMode) {
            return { memoNames: [], count: 0, hasChanges: false };
        }

        const content = state.content.trim();
        if (!content) {
            return { memoNames: [], count: 0, hasChanges: false };
        }

        // 1. 上传本地文件
        const newAttachments = await uploadService.uploadFiles(state.localFiles);
        const allAttachments = [...state.metadata.attachments, ...newAttachments];

        // 2. 格式化为待办格式（整体作为一个任务）
        const formattedContent = formatAsTodo(content);

        // 3. 创建单个 Memo
        const memoData = create(MemoSchema, {
            content: formattedContent,
            visibility: state.metadata.visibility,
            attachments: allAttachments,
            relations: state.metadata.relations,
            location: state.metadata.location,
        });

        const memo = await memoServiceClient.createMemo({ memo: memoData });

        return {
            memoNames: [memo.name],
            count: 1,
            hasChanges: true,
        };
    },

    /**
     * 预览格式化结果（不实际创建）
     */
    previewFormat(content: string): string {
        return formatAsTodo(content);
    },
};
