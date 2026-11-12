import { clockTime, dateKey } from "./dates.ts";
import type { ActiveTimer, TimeEntry } from "../data/model";

export function entriesFromTimer(
  timer: ActiveTimer,
  finishedAt: Date,
): TimeEntry[] {
  const start = new Date(timer.startedAt);
  const end = finishedAt.getTime();
  const segments: {
    date: string;
    start: Date;
    end: Date;
    milliseconds: number;
  }[] = [];

  for (let cursor = start.getTime(); cursor < end;) {
    const localDate = new Date(cursor);
    const nextMidnight = new Date(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate() + 1,
    ).getTime();
    const segmentEnd = Math.min(end, nextMidnight);
    segments.push({
      date: dateKey(localDate),
      start: localDate,
      end: new Date(segmentEnd),
      milliseconds: segmentEnd - cursor,
    });
    cursor = segmentEnd;
  }

  if (segments.length === 0) {
    segments.push({
      date: dateKey(finishedAt),
      start: finishedAt,
      end: finishedAt,
      milliseconds: 0,
    });
  }

  const totalMinutes = Math.max(1, Math.round((end - start.getTime()) / 60000));
  const allocations = segments.map((segment) =>
    Math.floor(segment.milliseconds / 60000),
  );
  let remaining =
    totalMinutes - allocations.reduce((sum, minutes) => sum + minutes, 0);

  const byRemainder = segments
    .map((segment, index) => ({
      index,
      remainder: segment.milliseconds % 60000,
    }))
    .sort((a, b) => b.remainder - a.remainder);

  for (const segment of byRemainder) {
    if (remaining <= 0) break;
    allocations[segment.index] += 1;
    remaining -= 1;
  }

  return segments.flatMap((segment, index) => {
    const minutes = allocations[index];
    if (minutes === 0) return [];

    return [
      {
        id: crypto.randomUUID(),
        taskId: timer.taskId,
        title: timer.title,
        date: segment.date,
        minutes,
        startTime: clockTime(segment.start),
        endTime: clockTime(segment.end),
        createdAt: finishedAt.toISOString(),
      },
    ];
  });
}
