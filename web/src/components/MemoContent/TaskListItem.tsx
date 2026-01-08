import type { Element } from "hast";
import { useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateMemo } from "@/hooks/useMemoQueries";
import { toggleTaskAtIndex } from "@/utils/markdown-manipulation";
import { create } from "@bufbuild/protobuf";
import { Memo_TimerDataSchema } from "@/types/proto/api/v1/memo_service_pb";
import { calculateNewTimerState } from "@/utils/memo";
import { useMemoViewContext, useMemoViewDerived } from "../MemoView/MemoViewContext";

interface TaskListItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  node?: Element; // AST node from react-markdown
  checked?: boolean;
}

export const TaskListItem: React.FC<TaskListItemProps> = ({ checked, ...props }) => {
  const { memo } = useMemoViewContext();
  const { readonly } = useMemoViewDerived();
  const checkboxRef = useRef<HTMLButtonElement>(null);
  const { mutate: updateMemo } = useUpdateMemo();

  const handleChange = async (newChecked: boolean) => {
    // Don't update if readonly or no memo
    if (readonly || !memo) {
      return;
    }

    // Find the task index by walking up the DOM
    const listItem = checkboxRef.current?.closest("li.task-list-item");
    if (!listItem) {
      return;
    }

    // Get task index from data attribute, or calculate by counting
    const taskIndexStr = listItem.getAttribute("data-task-index");
    let taskIndex = 0;

    if (taskIndexStr !== null) {
      taskIndex = parseInt(taskIndexStr);
    } else {
      // Fallback: Calculate index by counting ALL task list items in the memo
      // Find the markdown-content container by traversing up from the list item
      const container = listItem.closest(".markdown-content");
      if (!container) {
        return;
      }

      const allTaskItems = container.querySelectorAll("li.task-list-item");
      for (let i = 0; i < allTaskItems.length; i++) {
        if (allTaskItems[i] === listItem) {
          taskIndex = i;
          break;
        }
      }
    }

    // Update memo content using the string manipulation utility
    const newContent = toggleTaskAtIndex(memo.content, taskIndex, newChecked);

    const updateRequest: any = {
      name: memo.name,
      content: newContent,
    };
    const updateMask = ["content"];

    // Auto-pause timer if checking a task (marking as done) and timer is running
    if (newChecked && memo.timer?.isRunning) {
      const newTimerState = calculateNewTimerState(
        Date.now() / 1000,
        Number(memo.timer.lastStartTimestamp),
        Number(memo.timer.accumulatedSeconds),
        false // force pause
      );

      updateRequest.timer = create(Memo_TimerDataSchema, newTimerState);
      updateMask.push("timer");
    }

    updateMemo({
      update: updateRequest,
      updateMask: updateMask,
    });
  };

  // Override the disabled prop from remark-gfm (which defaults to true)
  return <Checkbox ref={checkboxRef} checked={checked} disabled={readonly} onCheckedChange={handleChange} className={props.className} />;
};
