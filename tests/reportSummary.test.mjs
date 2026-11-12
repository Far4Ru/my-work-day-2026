import assert from "node:assert/strict";
import test from "node:test";
import { buildReportSummary } from "../src/reports/reportSummary.ts";

test("weekly report keeps planned, completed, and timed work separate", () => {
  const tasks = [
    {
      title: "Запланированная задача",
      project: "Проект",
      date: "2026-11-10",
      completedAt: null,
    },
    {
      title: "Завершённая задача без даты",
      project: "Проект",
      date: null,
      completedAt: "2026-11-12T12:00:00.000Z",
    },
    {
      title: "Задача прошлой недели",
      project: "Проект",
      date: "2026-11-05",
      completedAt: "2026-11-05T12:00:00.000Z",
    },
  ];
  const entries = [
    { title: "Работа", date: "2026-11-12", minutes: 45 },
    { title: "Ранее", date: "2026-11-05", minutes: 30 },
  ];

  const summary = buildReportSummary("week", "2026-11-12", tasks, entries);

  assert.equal(summary.start, "2026-11-09");
  assert.equal(summary.end, "2026-11-15");
  assert.equal(summary.plannedCount, 1);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.minutes, 45);
  assert.equal(summary.days, 1);
  assert.match(summary.markdown, /Завершённая задача без даты/);
  assert.doesNotMatch(summary.markdown, /Задача прошлой недели/);
});
