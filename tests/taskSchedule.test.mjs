import assert from "node:assert/strict";
import test from "node:test";
import { scheduleTask, unscheduleTask } from "../src/lib/taskSchedule.ts";

const task = {
  id: "task-1",
  title: "Подготовить план",
  project: "Личное",
  note: "",
  date: "2026-11-12",
  dueTime: "14:00",
  estimateMinutes: 30,
  status: "done",
  createdAt: "2026-11-12T10:00:00.000Z",
  completedAt: "2026-11-12T13:00:00.000Z",
};

test("unscheduling removes the day and deadline without changing task progress", () => {
  const unscheduled = unscheduleTask(task);

  assert.equal(unscheduled.date, null);
  assert.equal(unscheduled.dueTime, "");
  assert.equal(unscheduled.status, "done");
  assert.equal(unscheduled.completedAt, task.completedAt);
  assert.equal(task.date, "2026-11-12");
});

test("scheduling an undated task assigns the selected day", () => {
  const scheduled = scheduleTask(unscheduleTask(task), "2026-11-20");

  assert.equal(scheduled.date, "2026-11-20");
  assert.equal(scheduled.status, "done");
  assert.equal(scheduled.completedAt, task.completedAt);
});
