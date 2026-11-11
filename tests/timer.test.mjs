import assert from "node:assert/strict";
import test from "node:test";
import { minutesBetweenTimes } from "../src/dates.ts";
import { entriesFromTimer } from "../src/timer.ts";

test("manual clock times require an end after the start", () => {
  assert.equal(minutesBetweenTimes("09:15", "10:45"), 90);
  assert.equal(minutesBetweenTimes("09:15", "09:15"), null);
  assert.equal(minutesBetweenTimes("23:30", "00:15"), null);
  assert.equal(minutesBetweenTimes("25:00", "26:00"), null);
});

test("a timer crossing midnight allocates minutes to both local dates", () => {
  const start = new Date(2026, 10, 11, 23, 58);
  const end = new Date(2026, 10, 12, 0, 3);
  const timer = {
    id: "activeTimer",
    title: "Работа",
    taskId: null,
    startedAt: start.toISOString(),
  };

  const entries = entriesFromTimer(timer, end);

  assert.deepEqual(
    entries.map(({ date, minutes }) => ({ date, minutes })),
    [
      { date: "2026-11-11", minutes: 2 },
      { date: "2026-11-12", minutes: 3 },
    ],
  );
  assert.deepEqual(
    entries.map(({ startTime, endTime }) => ({ startTime, endTime })),
    [
      { startTime: "23:58", endTime: "00:00" },
      { startTime: "00:00", endTime: "00:03" },
    ],
  );
});
