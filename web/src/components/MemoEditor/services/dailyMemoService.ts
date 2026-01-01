import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { memoServiceClient } from "@/connect";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { ListMemosRequestSchema, MemoSchema } from "@/types/proto/api/v1/memo_service_pb";
import type { EditorState } from "../state";
import { uploadService } from "./uploadService";

const DAILY_DATE_FORMAT = "YYYY-MM-DD";
const DAILY_TITLE_PREFIX = "# ";

function getDailyTitle(date: Date = new Date()): string {
  return `${DAILY_TITLE_PREFIX}${dayjs(date).format(DAILY_DATE_FORMAT)}`;
}

function isDailyMemoForDate(memo: Memo, date: Date): boolean {
  return memo.content.trim().startsWith(getDailyTitle(date));
}

/**
 * 提取用户名中的 user ID
 */
function extractUserIdFromName(name: string): string {
  const match = name.match(/users\/(\d+)/);
  return match ? match[1] : "";
}

/**
 * 查找当天的每日 Memo
 * 使用正确的 CEL 语法：creator_id 和 created_ts（Unix 时间戳）
 */
async function findTodayMemo(creatorName: string): Promise<Memo | null> {
  const today = new Date();

  // 获取用户 ID
  const userId = extractUserIdFromName(creatorName);
  if (!userId) return null;

  // 构建日期范围过滤器（Unix 时间戳，秒级）
  const startOfDayTs = Math.floor(dayjs(today).startOf("day").valueOf() / 1000);
  const endOfDayTs = startOfDayTs + 86400; // 加一天的秒数

  // 使用 CEL 过滤器查询当天创建的 Memo
  // 语法参考：web/src/hooks/useMemoFilters.ts
  const filter = `creator_id == ${userId} && created_ts >= ${startOfDayTs} && created_ts < ${endOfDayTs}`;

  const response = await memoServiceClient.listMemos(
    create(ListMemosRequestSchema, {
      filter,
      pageSize: 100,
    } as Record<string, unknown>),
  );

  return response.memos.find((memo) => isDailyMemoForDate(memo, today)) || null;
}

/**
 * 格式化待办事项内容
 * 确保用户输入的内容格式化为待办列表项
 */
function formatTodoContent(content: string): string {
  const trimmed = content.trim();

  // 如果已经是待办格式，直接返回
  if (trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]")) {
    return trimmed;
  }

  // 如果以 - 开头（普通列表项），转换为待办
  if (trimmed.startsWith("- ")) {
    return `- [ ] ${trimmed.slice(2)}`;
  }

  // 如果内容包含多行，可能是用户输入的多个待办项或普通文本
  // 这种情况下保持原样，让用户自己格式化
  if (trimmed.includes("\n")) {
    return trimmed;
  }

  // 其他情况，添加待办前缀
  return `- [ ] ${trimmed}`;
}

export const dailyMemoService = {
  /**
   * 保存每日待办
   * 核心逻辑：查找今天的 Memo，存在则追加，不存在则创建
   */
  async save(
    state: EditorState,
    options: {
      creatorName: string;
      enableDailyMode?: boolean;
    },
  ): Promise<{ memoName: string; hasChanges: boolean; isNewDaily: boolean }> {
    // 如果未启用每日模式，返回空结果让调用者使用默认逻辑
    if (!options.enableDailyMode) {
      return { memoName: "", hasChanges: false, isNewDaily: false };
    }

    // 1. 上传本地文件
    const newAttachments = await uploadService.uploadFiles(state.localFiles);
    const allAttachments = [...state.metadata.attachments, ...newAttachments];

    // 2. 查找今天的 Memo
    const todayMemo = await findTodayMemo(options.creatorName);

    if (todayMemo) {
      // 3a. 追加到已有的每日 Memo
      const formattedContent = formatTodoContent(state.content);
      const updatedContent = `${todayMemo.content}\n${formattedContent}`;

      // 合并附件
      const mergedAttachments = [...todayMemo.attachments, ...allAttachments];

      const updatedMemo = await memoServiceClient.updateMemo({
        memo: create(MemoSchema, {
          name: todayMemo.name,
          content: updatedContent,
          attachments: mergedAttachments,
        } as Record<string, unknown>),
        updateMask: create(FieldMaskSchema, {
          paths: ["content", "attachments", "update_time"],
        }),
      });

      return { memoName: updatedMemo.name, hasChanges: true, isNewDaily: false };
    } else {
      // 3b. 创建新的每日 Memo
      const title = getDailyTitle();
      const formattedContent = formatTodoContent(state.content);
      const fullContent = `${title}\n\n${formattedContent}`;

      const newMemo = await memoServiceClient.createMemo({
        memo: create(MemoSchema, {
          content: fullContent,
          visibility: state.metadata.visibility,
          attachments: allAttachments,
          relations: state.metadata.relations,
          location: state.metadata.location,
        } as Record<string, unknown>),
      });

      return { memoName: newMemo.name, hasChanges: true, isNewDaily: true };
    }
  },
};
