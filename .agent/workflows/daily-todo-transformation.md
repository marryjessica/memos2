---
description: 将 Memos 改造为原子化待办程序的实施计划
---

# 原子化待办程序改造实施计划

## 🎯 核心需求

1. **每个待办独立存储**：一条待办 = 一个 Memo，拥有唯一 ID
2. **批注功能**：每条待办可添加批注（利用现有 Comment 系统）
3. **日期分组展示**：相同日期的待办聚合展示，但数据层独立
4. **右键菜单**：快速操作待办（编辑、批注、删除）

---

## 📁 新增文件清单

### Hooks

| 文件路径 | 职责 |
|---------|------|
| `web/src/hooks/useGroupedMemos.ts` | 按日期分组 Memo 的 Hook |
| `web/src/hooks/useAnnotations.ts` | 批注管理 Hook（基于 Comment API）|

### 组件

| 文件路径 | 职责 |
|---------|------|
| `web/src/components/DailyMemoGroup/` | 日期分组卡片组件 |
| `web/src/components/MemoContextMenu/` | 右键上下文菜单 |
| `web/src/components/MemoAnnotationPanel/` | 批注侧边面板 |

### 服务

| 文件路径 | 职责 |
|---------|------|
| `web/src/components/MemoEditor/services/atomicMemoService.ts` | 原子化保存服务 |

---

## 🔧 实施步骤

### 第一步：创建 `useGroupedMemos` Hook

**文件**: `web/src/hooks/useGroupedMemos.ts`

将 Memo 列表按 `displayTime` 日期分组：

```typescript
interface DailyGroup {
  date: string;           // "2026-01-02"
  displayDate: string;    // "今天" / "昨天" / "1月2日"
  memos: Memo[];
  incompleteCount: number;
  completeCount: number;
}

function useGroupedMemos(memos: Memo[]): DailyGroup[]
```

---

### 第二步：创建 `useAnnotations` Hook

**文件**: `web/src/hooks/useAnnotations.ts`

复用 Memos 现有 Comment API：

```typescript
interface UseAnnotationsReturn {
  annotations: Memo[];
  addAnnotation: (content: string) => Promise<Memo>;
  deleteAnnotation: (name: string) => Promise<void>;
}

function useAnnotations(memoName: string): UseAnnotationsReturn
```

---

### 第三步：创建 `atomicMemoService`

**文件**: `web/src/components/MemoEditor/services/atomicMemoService.ts`

将多行内容拆分为独立 Memo：

```typescript
// 用户输入:
// 完成项目计划书
// 开会讨论需求
// 代码审查

// 结果: 创建 3 个独立 Memo，每行为一条待办
```

---

### 第四步：修改 `memoService.ts`

**文件**: `web/src/components/MemoEditor/services/memoService.ts`

集成原子化保存：

```typescript
const result = await memoService.save(state, {
  memoName,
  parentMemoName,
  creatorName: currentUser?.name,
  enableAtomicMode: true, // 🆕 原子化模式
});
```

---

### 第五步：创建 UI 组件

1. **DailyMemoGroup** - 日期分组卡片
2. **MemoContextMenu** - 右键菜单（编辑、批注、删除）
3. **MemoAnnotationPanel** - 批注侧边面板

---

## 📋 执行顺序

// turbo-all

1. 创建 `web/src/hooks/useGroupedMemos.ts` ✅
2. 创建 `web/src/hooks/useAnnotations.ts` ✅
3. 创建 `web/src/components/DailyMemoGroup/` ✅
4. 创建 `web/src/components/MemoContextMenu/` ✅
5. 创建 `web/src/components/MemoAnnotationPanel/` ✅
6. 创建 `web/src/components/MemoEditor/services/atomicMemoService.ts` ✅
7. 修改 `web/src/components/MemoEditor/services/memoService.ts` ✅
8. 修改 `web/src/components/MemoEditor/index.tsx` ✅
9. 更新 hooks 和 services 导出 ✅
10. 运行 `npm run build` 验证 ✅

---

## ⚠️ 注意事项

- **多行拆分**：按 Enter 换行拆分为多条待办，自动换行不拆分
- **附件处理**：多行拆分时，附件仅附加到第一条待办
- **批注系统**：复用 Comment API，无需后端改动
- **向后兼容**：`enableAtomicMode` flag 控制新行为

---

## ✅ 验证结果

1. **构建验证** ✅ - `npm run build` 成功
2. **新增组件** ✅ - 6 个新文件创建完成
3. **原子化逻辑** ✅ - 多行拆分服务就绪

## 🎯 核心需求

1. **每天只有一个 Memo**：标题自动为当天日期（如 `# 2026-01-01`）
2. **追加待办逻辑**：新待办追加到当天已有的 Memo 中，而不是创建新 Memo
3. **保留的功能**：日历、Tags、归档、笔记链接、富文本

---

## 📁 需要修改的文件清单

### 新增文件

| 文件路径 | 职责 |
|---------|------|
| `web/src/hooks/useDailyMemo.ts` | 获取/查询当天 Memo 的 Hook |
| `web/src/components/MemoEditor/services/dailyMemoService.ts` | 每日 Memo 创建/追加逻辑 |

### 修改文件

| 文件路径 | 改动范围 |
|---------|---------|
| `web/src/components/MemoEditor/services/memoService.ts` | 集成每日 Memo 逻辑 |
| `web/src/components/MemoEditor/index.tsx` | 传递每日模式 flag（可选）|
| `web/src/hooks/useMemoQueries.ts` | 添加按日期查询 Memo 的 query key |

---

## 🔧 实施步骤

### 第一步：创建 `useDailyMemo` Hook

**文件**: `web/src/hooks/useDailyMemo.ts`

这个 Hook 负责查询当天是否已有 Memo。

```typescript
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memoServiceClient } from "@/connect";
import { create } from "@bufbuild/protobuf";
import { ListMemosRequestSchema } from "@/types/proto/api/v1/memo_service_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import useCurrentUser from "./useCurrentUser";

// 日期格式：用于生成日期标题
export const DAILY_DATE_FORMAT = "YYYY-MM-DD";
export const DAILY_TITLE_PREFIX = "# ";

/**
 * 生成每日 Memo 的标题
 * @param date 日期，默认今天
 */
export function getDailyTitle(date: Date = new Date()): string {
  return `${DAILY_TITLE_PREFIX}${dayjs(date).format(DAILY_DATE_FORMAT)}`;
}

/**
 * 检查 Memo 内容是否以指定日期标题开头
 */
export function isDailyMemoForDate(memo: Memo, date: Date = new Date()): boolean {
  const title = getDailyTitle(date);
  return memo.content.trim().startsWith(title);
}

// Query key factory
export const dailyMemoKeys = {
  all: ["daily-memo"] as const,
  byDate: (date: string) => [...dailyMemoKeys.all, date] as const,
};

/**
 * 提取用户名中的 user ID
 */
function extractUserIdFromName(name: string): string {
  const match = name.match(/users\/(\d+)/);
  return match ? match[1] : "";
}

/**
 * Hook: 获取指定日期的每日 Memo
 * @param date 日期，默认今天
 */
export function useDailyMemo(date: Date = new Date()) {
  const user = useCurrentUser();
  const dateStr = dayjs(date).format(DAILY_DATE_FORMAT);

  return useQuery({
    queryKey: dailyMemoKeys.byDate(dateStr),
    queryFn: async () => {
      if (!user?.name) return null;

      // 获取用户 ID
      const userId = extractUserIdFromName(user.name);
      if (!userId) return null;

      // 构建日期范围过滤器（Unix 时间戳，秒级）
      // 注意：后端使用 created_ts 字段存储 Unix 时间戳
      const startOfDayTs = Math.floor(dayjs(date).startOf("day").valueOf() / 1000);
      const endOfDayTs = startOfDayTs + 86400; // 加一天的秒数

      // 使用 CEL 过滤器查询当天创建的 Memo
      // 语法参考：web/src/hooks/useMemoFilters.ts
      const filter = `creator_id == ${userId} && created_ts >= ${startOfDayTs} && created_ts < ${endOfDayTs}`;

      const response = await memoServiceClient.listMemos(
        create(ListMemosRequestSchema, {
          filter,
          pageSize: 100,
        } as Record<string, unknown>)
      );

      // 在返回的 Memo 中查找以日期标题开头的那个
      const dailyMemo = response.memos.find((memo) => isDailyMemoForDate(memo, date));
      return dailyMemo || null;
    },
    enabled: !!user?.name,
    staleTime: 1000 * 30, // 30 秒内认为缓存有效
    gcTime: 1000 * 60 * 5, // 5 分钟后清理缓存
  });
}

/**
 * Hook: 使缓存失效
 */
export function useInvalidateDailyMemo() {
  const queryClient = useQueryClient();

  return (date: Date = new Date()) => {
    const dateStr = dayjs(date).format(DAILY_DATE_FORMAT);
    queryClient.invalidateQueries({ queryKey: dailyMemoKeys.byDate(dateStr) });
  };
}
```

---

### 第二步：创建 `dailyMemoService`

**文件**: `web/src/components/MemoEditor/services/dailyMemoService.ts`

这个 Service 封装了"查找当天 Memo → 追加或创建"的核心逻辑。

```typescript
import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { memoServiceClient } from "@/connect";
import { MemoSchema, ListMemosRequestSchema } from "@/types/proto/api/v1/memo_service_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
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
    } as Record<string, unknown>)
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
    }
  ): Promise<{ memoName: string; hasChanges: boolean; isNewDaily: boolean }> {
    // 如果未启用每日模式，返回 null 让调用者使用默认逻辑
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
```

---

### 第三步：修改 `memoService.ts`

**文件**: `web/src/components/MemoEditor/services/memoService.ts`

在 `save` 函数中集成每日 Memo 逻辑。

```typescript
// 在文件顶部添加导入
import { dailyMemoService } from "./dailyMemoService";

// 修改 save 函数签名，添加新选项
async save(
  state: EditorState,
  options: {
    memoName?: string;
    parentMemoName?: string;
    creatorName?: string;         // 新增
    enableDailyMode?: boolean;    // 新增：是否启用每日模式
  },
): Promise<{ memoName: string; hasChanges: boolean }> {
  
  // 🆕 如果启用了每日模式且不是编辑已有 Memo，使用每日逻辑
  if (options.enableDailyMode && !options.memoName && !options.parentMemoName) {
    const result = await dailyMemoService.save(state, {
      creatorName: options.creatorName || "",
      enableDailyMode: true,
    });
    
    if (result.hasChanges) {
      return { memoName: result.memoName, hasChanges: true };
    }
  }
  
  // 原有逻辑保持不变...
  // 1. Upload local files first
  const newAttachments = await uploadService.uploadFiles(state.localFiles);
  // ... 其余代码不变
}
```

---

### 第四步：修改 `MemoEditorImpl` 组件

**文件**: `web/src/components/MemoEditor/index.tsx`

传递 `creatorName` 和 `enableDailyMode` 到 service。

```typescript
// 修改 handleSave 函数

async function handleSave() {
  const { valid, reason } = validationService.canSave(state);
  if (!valid) {
    toast.error(reason || "Cannot save");
    return;
  }

  dispatch(actions.setLoading("saving", true));

  try {
    const result = await memoService.save(state, {
      memoName,
      parentMemoName,
      creatorName: currentUser?.name,     // 🆕 传递当前用户名
      enableDailyMode: true,              // 🆕 启用每日模式
    });

    // ... 其余代码不变
  }
}
```

---

### 第五步：更新 hooks 导出

**文件**: `web/src/hooks/index.ts`

```typescript
// 添加新 hook 的导出
export * from "./useDailyMemo";
```

---

### 第六步：更新 services 导出

**文件**: `web/src/components/MemoEditor/services/index.ts`

```typescript
// 添加新 service 的导出
export { dailyMemoService } from "./dailyMemoService";
```

---

## 🎨 可选优化

### UI 改进：显示每日待办卡片样式

可以在 `MemoView` 组件中检测是否为每日 Memo，并应用特殊样式：

**文件**: `web/src/components/MemoView/index.tsx`

```typescript
const isDailyMemo = memo.content.trim().startsWith("# 20"); // 简单检测

// 在 className 中添加条件样式
className={cn(
  "memo-view",
  isDailyMemo && "daily-memo-card border-primary/30 bg-primary/5"
)}
```

### 编辑器占位符提示

**文件**: `web/src/components/PagedMemoList/PagedMemoList.tsx`

```typescript
<MemoEditor
  className="mb-2"
  cacheKey="home-memo-editor"
  placeholder={t("editor.add-todo-today")}  // 修改占位符文案
/>
```

---

## 🧪 测试要点

1. **首次创建**：当天没有 Memo 时，输入内容应创建新的每日 Memo
2. **追加待办**：当天已有 Memo 时，输入内容应追加到已有 Memo
3. **附件合并**：追加时附件应正确合并
4. **日期边界**：跨日测试（23:59 创建 vs 00:01 创建）
5. **编辑已有**：点击编辑已有 Memo 应走原有更新逻辑
6. **评论功能**：评论功能应不受影响

---

## 📋 执行顺序

// turbo-all

1. 创建 `web/src/hooks/useDailyMemo.ts`
2. 创建 `web/src/components/MemoEditor/services/dailyMemoService.ts`
3. 修改 `web/src/components/MemoEditor/services/memoService.ts`
4. 修改 `web/src/components/MemoEditor/services/index.ts`
5. 修改 `web/src/hooks/index.ts`（如果存在）
6. 修改 `web/src/components/MemoEditor/index.tsx`
7. 运行 `npm run dev` 测试

---

## ⚠️ 注意事项

- **CEL 过滤器语法**：使用 `creator_id`（整数）和 `created_ts`（Unix 时间戳秒级），不是 `creator` 和 `create_time`
- **时区问题**：`dayjs` 使用本地时区，确保前后端时区一致
- **并发问题**：快速连续点击保存可能导致创建多个每日 Memo，可添加防抖
- **向后兼容**：启用 `enableDailyMode` flag 使改动可控

---

## ✅ 方案验证结果

本方案已通过代码验证：

1. **CEL 过滤器支持** ✅ - 后端 `plugin/filter/schema.go` 定义了 `creator_id` 和 `created_ts` 字段
2. **时间戳格式** ✅ - 使用 Unix 秒级时间戳（整数），参考 `useMemoFilters.ts` 第 80-88 行
3. **UpdateMemo API** ✅ - 支持 `content`, `attachments`, `update_time` 字段更新
4. **hooks 导出结构** ✅ - `web/src/hooks/index.ts` 使用 `export *` 模式
