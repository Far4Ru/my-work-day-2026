import type { TimeEntry } from "../data/model";
import { minutesBetweenTimes } from "./dates";

export function hasEditableClockTimes(entry: TimeEntry): boolean {
  if (!entry.startTime || !entry.endTime) return false;
  return minutesBetweenTimes(entry.startTime, entry.endTime) === entry.minutes;
}
