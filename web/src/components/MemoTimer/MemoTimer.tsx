import { create } from "@bufbuild/protobuf";
import { useUpdateMemo } from "@/hooks/useMemoQueries";
import { Memo, Memo_TimerDataSchema } from "@/types/proto/api/v1/memo_service_pb";
import { PlayIcon, PauseIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { calculateTimerDuration, calculateNewTimerState } from "@/utils/memo";

interface Props {
    memo: Memo;
    className?: string;
}

const MemoTimer: React.FC<Props> = ({ memo, className }) => {
    const { t } = useTranslation();
    const { mutateAsync: updateMemo } = useUpdateMemo();
    const [now, setNow] = useState(Date.now() / 1000);

    // Parse timer data safely
    const timer = memo.timer || {
        accumulatedSeconds: BigInt(0),
        isRunning: false,
        lastStartTimestamp: BigInt(0),
    };

    const isRunning = timer.isRunning;
    const accumulated = Number(timer.accumulatedSeconds);
    const lastStart = Number(timer.lastStartTimestamp);

    // Calculate current duration
    const currentDuration = calculateTimerDuration(now, lastStart, accumulated, isRunning);

    // Format duration as HH:MM:ss
    const formatDuration = (seconds: number) => {
        if (seconds < 0) seconds = 0;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!isRunning) return;

        // Update 'now' every second to refresh UI
        const interval = setInterval(() => {
            setNow(Date.now() / 1000);
        }, 1000);

        return () => clearInterval(interval);
    }, [isRunning]);

    const handleToggleTimer = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        const now = Date.now() / 1000;
        const newTimerState = calculateNewTimerState(
            now,
            Number(timer.lastStartTimestamp),
            Number(timer.accumulatedSeconds),
            !isRunning
        );

        await updateMemo({
            update: {
                name: memo.name,
                timer: create(Memo_TimerDataSchema, newTimerState),
            },
            updateMask: ["timer"],
        });
    };

    // Only show timer if it has data or on hover (to be handled by parent or CSS)
    // For now, let's always render if passed, but maybe style it subtly if 0 and paused?
    // User req: "start/pause button should be placed before the three action buttons"

    return (
        <div className={cn("flex flex-row items-center gap-1 bg-gray-100 dark:bg-zinc-800 rounded-md px-2 py-0.5", className)}>
            <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                {formatDuration(currentDuration)}
            </span>
            <button
                className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
                onClick={handleToggleTimer}
                title={isRunning ? t("common.pause") : t("common.start")}
            >
                {isRunning ? (
                    <PauseIcon className="w-3 h-3 text-amber-500" />
                ) : (
                    <PlayIcon className="w-3 h-3 text-gray-500 hover:text-green-600" />
                )}
            </button>
        </div>
    );
};

export default MemoTimer;
