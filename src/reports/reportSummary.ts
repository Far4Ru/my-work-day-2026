import type { ReportPeriod, Task, TimeEntry } from "../data/model";
import {
  addDays,
  dateKey,
  dateKeyFromTimestamp,
  formatDate,
  minutesLabel,
  mondayOf,
  parseDate,
} from "../lib/dates.ts";

function periodBounds(
  period: ReportPeriod,
  selectedDate: string,
): [string, string] {
  const date = parseDate(selectedDate);

  if (period === "day") return [selectedDate, selectedDate];
  if (period === "week")
    return [mondayOf(selectedDate), addDays(mondayOf(selectedDate), 6)];
  if (period === "month") {
    return [
      dateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
      dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
    ];
  }

  return [`${date.getFullYear()}-01-01`, `${date.getFullYear()}-12-31`];
}

export function reportTitle(
  period: ReportPeriod,
  start: string,
  end: string,
): string {
  if (period === "day") return formatDate(start);
  if (period === "year") return String(parseDate(start).getFullYear());
  if (period === "month")
    return formatDate(start, { month: "long", year: "numeric" });
  return `${formatDate(start, { day: "numeric", month: "short" })} — ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function buildReportSummary(
  period: ReportPeriod,
  selectedDate: string,
  tasks: Task[],
  entries: TimeEntry[],
) {
  const [start, end] = periodBounds(period, selectedDate);
  const reportTasks = tasks.filter(
    (task) => task.date !== null && task.date >= start && task.date <= end,
  );
  const reportDone = tasks.filter((task) => {
    const completionDate = task.completedAt
      ? dateKeyFromTimestamp(task.completedAt)
      : null;
    return completionDate && completionDate >= start && completionDate <= end;
  });
  const reportEntries = entries.filter(
    (entry) => entry.date >= start && entry.date <= end,
  );
  const reportMinutes = reportEntries.reduce(
    (total, entry) => total + entry.minutes,
    0,
  );
  const reportDays = new Set(reportEntries.map((entry) => entry.date)).size;
  const completedTasksByProject = new Map<string, Task[]>();

  for (const task of reportDone) {
    const project = task.project.trim() || "Без проекта";
    const projectTasks = completedTasksByProject.get(project) ?? [];
    projectTasks.push(task);
    completedTasksByProject.set(project, projectTasks);
  }

  const completedTaskLines = [...completedTasksByProject.entries()]
    .sort(([firstProject], [secondProject]) =>
      firstProject.localeCompare(secondProject, "ru"),
    )
    .flatMap(([project, projectTasks]) => [
      `### ${project} (${projectTasks.length})`,
      ...projectTasks.map(
        (task) =>
          `- ${task.title} (${task.completedAt ? dateKeyFromTimestamp(task.completedAt) : ""})`,
      ),
      "",
    ]);
  const reportMarkdown = [
    `# My Work Day — ${reportTitle(period, start, end)}`,
    "",
    `Период: ${start} — ${end}`,
    `Запланировано задач: ${reportTasks.length}`,
    `Выполнено задач: ${reportDone.length}`,
    `Учтено времени: ${minutesLabel(reportMinutes)}`,
    "",
    "## Выполнено",
    ...(completedTaskLines.length > 0 ? completedTaskLines : ["_нет_", ""]),
    "## Учёт времени",
    ...reportEntries.map(
      (entry) =>
        `- ${entry.date}: ${entry.title} — ${minutesLabel(entry.minutes)}`,
    ),
  ].join("\n");

  return {
    start,
    end,
    plannedCount: reportTasks.length,
    completedCount: reportDone.length,
    minutes: reportMinutes,
    days: reportDays,
    markdown: reportMarkdown,
  };
}
