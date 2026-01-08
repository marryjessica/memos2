import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memoServiceClient } from "@/connect";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { MemoSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { memoKeys, useMemoComments } from "./useMemoQueries";

/**
 * Hook return type for annotation management
 */
export interface UseAnnotationsReturn {
  /** List of annotations (comments) for the memo */
  annotations: Memo[];
  /** Total count of annotations */
  count: number;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Add a new annotation */
  addAnnotation: (content: string) => Promise<Memo>;
  /** Update an annotation */
  updateAnnotation: (payload: { name: string; content: string }) => Promise<void>;
  /** Delete an annotation */
  deleteAnnotation: (annotationName: string) => Promise<void>;
  /** Whether an annotation is being added */
  isAdding: boolean;
  /** Whether an annotation is being updated */
  isUpdating: boolean;
  /** Whether an annotation is being deleted */
  isDeleting: boolean;
}

/**
 * Hook to manage annotations (comments) for a memo
 * Leverages the existing Comment API in Memos
 *
 * @param memoName - The resource name of the memo (e.g., "memos/123")
 * @returns Annotation management utilities
 *
 * @example
 * ```tsx
 * const { annotations, addAnnotation, isLoading } = useAnnotations("memos/123");
 *
 * // Add annotation
 * await addAnnotation("完成初版，等待审核");
 *
 * // Delete annotation
 * await deleteAnnotation("memos/456");
 * ```
 */
export function useAnnotations(memoName: string): UseAnnotationsReturn {
  const queryClient = useQueryClient();

  // Fetch annotations using existing useMemoComments hook
  const { data: commentsResponse, isLoading, error } = useMemoComments(memoName, { enabled: !!memoName });

  const annotations = commentsResponse?.memos || [];
  const count = commentsResponse?.totalSize || annotations.length;

  // Mutation to add annotation
  const addMutation = useMutation({
    mutationFn: async (content: string) => {
      const commentMemo = create(MemoSchema, {
        content,
        visibility: Visibility.PRIVATE,
      });

      const result = await memoServiceClient.createMemoComment({
        name: memoName,
        comment: commentMemo,
      });

      return result;
    },
    onSuccess: () => {
      // Invalidate comments cache to refetch
      queryClient.invalidateQueries({ queryKey: memoKeys.comments(memoName) });
    },
  });

  // Mutation to update annotation
  const updateMutation = useMutation({
    mutationFn: async ({ name, content }: { name: string; content: string }) => {
      await memoServiceClient.updateMemo({
        memo: create(MemoSchema, { name, content }),
        updateMask: create(FieldMaskSchema, { paths: ["content"] }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoKeys.comments(memoName) });
    },
  });

  // Mutation to delete annotation
  const deleteMutation = useMutation({
    mutationFn: async (annotationName: string) => {
      await memoServiceClient.deleteMemo({ name: annotationName });
    },
    onSuccess: () => {
      // Invalidate comments cache to refetch
      queryClient.invalidateQueries({ queryKey: memoKeys.comments(memoName) });
    },
  });

  return {
    annotations,
    count,
    isLoading,
    error: error as Error | null,
    addAnnotation: addMutation.mutateAsync,
    updateAnnotation: updateMutation.mutateAsync,
    deleteAnnotation: deleteMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
