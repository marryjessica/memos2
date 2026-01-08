import { Visibility } from "@/types/proto/api/v1/memo_service_pb";

export const convertVisibilityFromString = (visibility: string) => {
  switch (visibility) {
    case "PUBLIC":
      return Visibility.PUBLIC;
    case "PROTECTED":
      return Visibility.PROTECTED;
    case "PRIVATE":
      return Visibility.PRIVATE;
    default:
      return Visibility.PUBLIC;
  }
};

export const convertVisibilityToString = (visibility: Visibility) => {
  switch (visibility) {
    case Visibility.PUBLIC:
      return "PUBLIC";
    case Visibility.PROTECTED:
      return "PROTECTED";
    case Visibility.PRIVATE:
      return "PRIVATE";
    default:
      return "PRIVATE";
  }
};

export const calculateTimerDuration = (
  now: number,
  lastStartTimestamp: number,
  accumulatedSeconds: number,
  isRunning: boolean
) => {
  return isRunning
    ? accumulatedSeconds + (Math.floor(now) - lastStartTimestamp)
    : accumulatedSeconds;
};

export const calculateNewTimerState = (
  now: number,
  lastStartTimestamp: number,
  accumulatedSeconds: number,
  shouldRun: boolean
) => {
  const currentTimestamp = Math.floor(now);
  const lastStart = Number(lastStartTimestamp);
  const accumulated = Number(accumulatedSeconds);

  let newAccumulated = accumulated;
  if (!shouldRun) {
    // Pausing: add duration since last start
    newAccumulated += currentTimestamp - lastStart;
  }

  // If starting: keep accumulated as is
  // If pausing: accumulated updated above

  return {
    accumulatedSeconds: BigInt(newAccumulated),
    isRunning: shouldRun,
    lastStartTimestamp: BigInt(shouldRun ? currentTimestamp : 0),
  };
};
