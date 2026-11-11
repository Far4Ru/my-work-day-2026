import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  clockTime,
  dateFromIsoWeekKey,
  dateKey,
  dateKeyFromTimestamp,
  formatDate,
  isoWeekKey,
  minutesBetweenTimes,
  minutesLabel,
  mondayOf,
  parseDate,
} from "./dates";
import { database } from "./database";
import type { ActiveTimer, ReportPeriod, Task, TimeEntry } from "./model";
import { entriesFromTimer } from "./timer";

type View = "tasks" | "calendar" | "statistics" | "reports";
type TaskRowDraft = Pick<
  Task,
  "id" | "title" | "project" | "date" | "dueTime" | "note"
> & {
  estimateMinutes: string;
  showTimeFields: boolean;
  timeStart: string;
  timeEnd: string;
};

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

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

function reportTitle(period: ReportPeriod, start: string, end: string): string {
  if (period === "day") return formatDate(start);
  if (period === "year") return String(parseDate(start).getFullYear());
  if (period === "month")
    return formatDate(start, { month: "long", year: "numeric" });
  return `${formatDate(start, { day: "numeric", month: "short" })} — ${formatDate(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

function hasEditableClockTimes(entry: TimeEntry): boolean {
  if (!entry.startTime || !entry.endTime) return false;
  return minutesBetweenTimes(entry.startTime, entry.endTime) === entry.minutes;
}

function App() {
  const [view, setView] = useState<View>("tasks");
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [quickTaskProject, setQuickTaskProject] = useState("");
  const [quickTaskDueTime, setQuickTaskDueTime] = useState("");
  const [showQuickTimeFields, setShowQuickTimeFields] = useState(false);
  const [isAddingDayTask, setIsAddingDayTask] = useState(false);
  const [taskRowDraft, setTaskRowDraft] = useState<TaskRowDraft | null>(null);
  const [quickTimeStart, setQuickTimeStart] = useState("");
  const [quickTimeEnd, setQuickTimeEnd] = useState("");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryMinutes, setEntryMinutes] = useState("");
  const [entryStart, setEntryStart] = useState("");
  const [entryEnd, setEntryEnd] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("week");
  const timerBusy = useRef(false);
  const taskSubmitBusy = useRef(false);
  const currentDay = dateKey(new Date(now));

  useEffect(() => {
    setIsAddingDayTask(false);
    setShowQuickTimeFields(false);
    setTaskRowDraft(null);
    setEditingEntryId(null);
  }, [selectedDate, view]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function refresh() {
    const [storedTasks, storedEntries, activeTimer] = await Promise.all([
      database.tasks(),
      database.entries(),
      database.activeTimer(),
    ]);
    setTasks(storedTasks);
    setEntries(storedEntries);
    setTimer(activeTimer ?? null);
  }

  useEffect(() => {
    refresh()
      .catch(() =>
        setError("Не удалось открыть IndexedDB. Проверьте настройки браузера."),
      )
      .finally(() => setReady(true));
  }, []);

  async function change(action: () => Promise<void>): Promise<boolean> {
    setError("");
    try {
      await action();
      await refresh();
      return true;
    } catch {
      setError("Не удалось сохранить данные в IndexedDB.");
      return false;
    }
  }

  const dayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.date === selectedDate)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [tasks, selectedDate],
  );
  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.date === selectedDate)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries, selectedDate],
  );
  const dayMinutes = dayEntries.reduce(
    (total, entry) => total + entry.minutes,
    0,
  );
  const dayCompleted = tasks.filter((task) =>
    task.completedAt
      ? dateKeyFromTimestamp(task.completedAt) === selectedDate
      : false,
  );
  const calendarDayTasks = [
    ...dayTasks,
    ...dayCompleted.filter(
      (completedTask) =>
        !dayTasks.some((dayTask) => dayTask.id === completedTask.id),
    ),
  ];
  const calendarCompletedCount = calendarDayTasks.filter(
    (task) => task.status === "done",
  ).length;
  const projects = Array.from(
    new Set(tasks.map((task) => task.project).filter(Boolean)),
  ).sort();
  const visibleDayTasks = projectFilter
    ? dayTasks.filter((task) => task.project === projectFilter)
    : dayTasks;

  function setTaskStatus(task: Task, status: Task["status"]) {
    const updated: Task = {
      ...task,
      status,
      completedAt: status === "done" ? new Date().toISOString() : null,
    };
    void change(() => database.saveTask(updated));
  }

  function deleteTask(task: Task) {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    void change(() => database.deleteTask(task.id));
    if (taskRowDraft?.id === task.id) setTaskRowDraft(null);
  }

  function addTaskForSelectedDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickTaskTitle.trim() || taskSubmitBusy.current) return;

    const task: Task = {
      id: crypto.randomUUID(),
      title: quickTaskTitle.trim(),
      project: quickTaskProject.trim(),
      note: "",
      date: selectedDate,
      dueTime: quickTaskDueTime,
      estimateMinutes: 0,
      status: "todo",
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    const time = createTaskTime(
      task,
      showQuickTimeFields,
      quickTimeStart,
      quickTimeEnd,
    );
    if (time === undefined) return;
    taskSubmitBusy.current = true;
    const startsTimer = time !== null && "startedAt" in time;
    if (startsTimer) timerBusy.current = true;
    void change(() => database.saveTaskWithTime(task, time)).then((saved) => {
      taskSubmitBusy.current = false;
      if (startsTimer) timerBusy.current = false;
      if (saved) {
        setQuickTaskTitle("");
        setQuickTaskProject("");
        setQuickTaskDueTime("");
        setQuickTimeStart("");
        setQuickTimeEnd("");
        setShowQuickTimeFields(false);
        setIsAddingDayTask(false);
      }
    });
  }

  function editTaskRow(task: Task) {
    setTaskRowDraft({
      id: task.id,
      title: task.title,
      project: task.project,
      date: task.date,
      dueTime: task.dueTime,
      note: task.note,
      estimateMinutes: task.estimateMinutes ? String(task.estimateMinutes) : "",
      showTimeFields: false,
      timeStart: "",
      timeEnd: "",
    });
  }

  function saveTaskRowEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskRowDraft?.title.trim() || taskSubmitBusy.current) return;
    const existing = tasks.find((task) => task.id === taskRowDraft.id);
    if (!existing) return;
    const estimateMinutes = Number(taskRowDraft.estimateMinutes || 0);
    if (!Number.isFinite(estimateMinutes) || estimateMinutes < 0) {
      setError("Укажите корректную оценку времени.");
      return;
    }

    const updated: Task = {
      ...existing,
      title: taskRowDraft.title.trim(),
      project: taskRowDraft.project.trim(),
      date: taskRowDraft.date,
      dueTime: taskRowDraft.dueTime,
      note: taskRowDraft.note.trim(),
      estimateMinutes: Math.round(estimateMinutes),
    };
    const time = createTaskTime(
      updated,
      taskRowDraft.showTimeFields,
      taskRowDraft.timeStart,
      taskRowDraft.timeEnd,
    );
    if (time === undefined) return;
    taskSubmitBusy.current = true;
    const startsTimer = time !== null && "startedAt" in time;
    if (startsTimer) timerBusy.current = true;
    void change(() => database.saveTaskWithTime(updated, time)).then(
      (saved) => {
        taskSubmitBusy.current = false;
        if (startsTimer) timerBusy.current = false;
        if (saved) setTaskRowDraft(null);
      },
    );
  }

  function createTaskTime(
    task: Task,
    enabled: boolean,
    start: string,
    end: string,
  ): TimeEntry | ActiveTimer | null | undefined {
    if (!enabled || (!start && !end)) return null;
    if (!start) {
      setError("Укажите время начала.");
      return undefined;
    }

    if (end) {
      const minutes = minutesBetweenTimes(start, end);
      if (minutes === null) {
        setError("Конец записи должен быть позже начала.");
        return undefined;
      }
      return {
        id: crypto.randomUUID(),
        taskId: task.id,
        title: task.title,
        date: selectedDate,
        minutes,
        startTime: start,
        endTime: end,
        createdAt: new Date().toISOString(),
      };
    }

    if (selectedDate !== currentDay || timer || timerBusy.current) {
      setError(
        "Запись без конца можно начать только сегодня, если таймер свободен.",
      );
      return undefined;
    }
    const startedAt = parseDate(selectedDate);
    const [hours, minutes] = start.split(":").map(Number);
    startedAt.setHours(hours, minutes, 0, 0);
    if (startedAt.getTime() > Date.now()) {
      setError("Время начала не может быть в будущем.");
      return undefined;
    }
    return {
      id: "activeTimer",
      taskId: task.id,
      title: task.title,
      startedAt: startedAt.toISOString(),
    };
  }

  function saveEntryEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const existing = entries.find((entry) => entry.id === editingEntryId);
    if (!existing || !entryTitle.trim()) return;

    const hasClockTimes = hasEditableClockTimes(existing);
    const minutes = hasClockTimes
      ? minutesBetweenTimes(entryStart, entryEnd)
      : Math.round(Number(entryMinutes));
    if (minutes === null || !Number.isFinite(minutes) || minutes < 1) {
      setError("Укажите корректное время или длительность записи.");
      return;
    }

    const updated: TimeEntry = {
      ...existing,
      title: entryTitle.trim(),
      minutes,
      startTime: hasClockTimes ? entryStart : undefined,
      endTime: hasClockTimes ? entryEnd : undefined,
    };
    void change(() => database.saveEntry(updated)).then((saved) => {
      if (saved) setEditingEntryId(null);
    });
  }

  function editEntry(entry: TimeEntry) {
    setEntryTitle(entry.title);
    setEntryMinutes(String(entry.minutes));
    setEntryStart(entry.startTime ?? "");
    setEntryEnd(entry.endTime ?? "");
    setEditingEntryId(entry.id);
  }

  function deleteEntry(entry: TimeEntry) {
    if (!window.confirm(`Удалить запись «${entry.title}»?`)) return;
    void change(() => database.deleteEntry(entry.id));
    if (editingEntryId === entry.id) setEditingEntryId(null);
  }

  function stopTimer() {
    if (!timer || timerBusy.current) return;
    timerBusy.current = true;
    const timerEntries = entriesFromTimer(timer, new Date());
    void change(() => database.finishTimer(timerEntries)).then(() => {
      timerBusy.current = false;
    });
  }

  function moveSelectedDate(amount: number) {
    if (
      (view !== "reports" && view !== "statistics") ||
      reportPeriod === "day"
    ) {
      setSelectedDate(addDays(selectedDate, amount));
      return;
    }

    if (reportPeriod === "week") {
      setSelectedDate(addDays(selectedDate, amount * 7));
      return;
    }

    const date = parseDate(selectedDate);
    const next =
      reportPeriod === "month"
        ? new Date(date.getFullYear(), date.getMonth() + amount, 1)
        : new Date(date.getFullYear() + amount, date.getMonth(), 1);
    setSelectedDate(dateKey(next));
  }

  const [reportStart, reportEnd] = periodBounds(reportPeriod, selectedDate);
  const reportTasks = tasks.filter(
    (task) => task.date >= reportStart && task.date <= reportEnd,
  );
  const reportDone = tasks.filter((task) => {
    const completionDate = task.completedAt
      ? dateKeyFromTimestamp(task.completedAt)
      : null;
    return (
      completionDate &&
      completionDate >= reportStart &&
      completionDate <= reportEnd
    );
  });
  const reportEntries = entries.filter(
    (entry) => entry.date >= reportStart && entry.date <= reportEnd,
  );
  const reportMinutes = reportEntries.reduce(
    (total, entry) => total + entry.minutes,
    0,
  );
  const reportDays = new Set(reportEntries.map((entry) => entry.date)).size;

  function exportReport() {
    const title = reportTitle(reportPeriod, reportStart, reportEnd);
    const lines = [
      `# My Work Day — ${title}`,
      "",
      `Период: ${reportStart} — ${reportEnd}`,
      `Запланировано задач: ${reportTasks.length}`,
      `Выполнено задач: ${reportDone.length}`,
      `Учтено времени: ${minutesLabel(reportMinutes)}`,
      "",
      "## Выполнено",
      ...reportDone.map(
        (task) =>
          `- ${task.title} (${task.completedAt ? dateKeyFromTimestamp(task.completedAt) : ""})`,
      ),
      "",
      "## Учёт времени",
      ...reportEntries.map(
        (entry) =>
          `- ${entry.date}: ${entry.title} — ${minutesLabel(entry.minutes)}`,
      ),
    ];
    const content = lines.join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `todo-did-${reportPeriod}-${reportStart}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const calendarStart = mondayOf(
    dateKey(
      new Date(
        parseDate(selectedDate).getFullYear(),
        parseDate(selectedDate).getMonth(),
        1,
      ),
    ),
  );
  const month = parseDate(selectedDate).getMonth();
  const calendarDays = Array.from({ length: 42 }, (_, index) =>
    addDays(calendarStart, index),
  );

  function moveMonth(amount: number) {
    const date = parseDate(selectedDate);
    setSelectedDate(
      dateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1)),
    );
  }

  const quickTaskForm = (
    <form className="hub-edit-row" onSubmit={addTaskForSelectedDay}>
      <input
        aria-label="Название новой задачи"
        placeholder="Новая задача…"
        value={quickTaskTitle}
        onChange={(event) => setQuickTaskTitle(event.target.value)}
        autoFocus
        required
      />
      <input
        aria-label="Проект новой задачи"
        placeholder="проект"
        value={quickTaskProject}
        onChange={(event) => setQuickTaskProject(event.target.value)}
      />
      <input
        aria-label="Время дедлайна новой задачи"
        type="time"
        value={quickTaskDueTime}
        onChange={(event) => setQuickTaskDueTime(event.target.value)}
      />
      {view === "calendar" && (
        <button
          type="button"
          className={
            showQuickTimeFields ? "clock-button is-active" : "clock-button"
          }
          title="Добавить учёт времени"
          aria-label="Добавить время к задаче"
          aria-pressed={showQuickTimeFields}
          onClick={() => setShowQuickTimeFields((visible) => !visible)}
        >
          🕒
        </button>
      )}
      {view === "calendar" && showQuickTimeFields && (
        <div className="task-time-fields">
          <label>
            Начало
            <input
              type="time"
              value={quickTimeStart}
              onChange={(event) => setQuickTimeStart(event.target.value)}
            />
          </label>
          <label>
            Окончание
            <input
              type="time"
              value={quickTimeEnd}
              onChange={(event) => setQuickTimeEnd(event.target.value)}
            />
          </label>
        </div>
      )}
      <button type="submit" title="Добавить" aria-label="Добавить задачу">
        💾
      </button>
      <button
        type="button"
        title="Отмена"
        aria-label="Отменить добавление задачи"
        onClick={() => setIsAddingDayTask(false)}
      >
        ✕
      </button>
    </form>
  );

  const taskRowEditor = taskRowDraft && (
    <form
      className="hub-edit-row task-row-editor"
      key={taskRowDraft.id}
      onSubmit={saveTaskRowEdit}
    >
      <input
        aria-label="Название задачи"
        value={taskRowDraft.title}
        onChange={(event) =>
          setTaskRowDraft({ ...taskRowDraft, title: event.target.value })
        }
        required
      />
      <input
        aria-label="Проект"
        placeholder="проект"
        value={taskRowDraft.project}
        onChange={(event) =>
          setTaskRowDraft({ ...taskRowDraft, project: event.target.value })
        }
      />
      <input
        aria-label="Дата задачи"
        type="date"
        value={taskRowDraft.date}
        onChange={(event) =>
          setTaskRowDraft({ ...taskRowDraft, date: event.target.value })
        }
        required
      />
      <input
        aria-label="Время дедлайна"
        type="time"
        value={taskRowDraft.dueTime}
        onChange={(event) =>
          setTaskRowDraft({ ...taskRowDraft, dueTime: event.target.value })
        }
      />
      <textarea
        aria-label="Заметка"
        placeholder="Заметка"
        value={taskRowDraft.note}
        onChange={(event) =>
          setTaskRowDraft({ ...taskRowDraft, note: event.target.value })
        }
        rows={2}
      />
      <input
        aria-label="План, минут"
        placeholder="План, минут"
        type="number"
        min="0"
        step="1"
        value={taskRowDraft.estimateMinutes}
        onChange={(event) =>
          setTaskRowDraft({
            ...taskRowDraft,
            estimateMinutes: event.target.value,
          })
        }
      />
      {view === "calendar" && (
        <button
          type="button"
          className={
            taskRowDraft.showTimeFields
              ? "clock-button is-active"
              : "clock-button"
          }
          title="Добавить учёт времени"
          aria-label="Добавить время к задаче"
          aria-pressed={taskRowDraft.showTimeFields}
          onClick={() =>
            setTaskRowDraft({
              ...taskRowDraft,
              showTimeFields: !taskRowDraft.showTimeFields,
            })
          }
        >
          🕒
        </button>
      )}
      {view === "calendar" && taskRowDraft.showTimeFields && (
        <div className="task-time-fields">
          <label>
            Начало
            <input
              type="time"
              value={taskRowDraft.timeStart}
              onChange={(event) =>
                setTaskRowDraft({
                  ...taskRowDraft,
                  timeStart: event.target.value,
                })
              }
            />
          </label>
          <label>
            Окончание
            <input
              type="time"
              value={taskRowDraft.timeEnd}
              onChange={(event) =>
                setTaskRowDraft({
                  ...taskRowDraft,
                  timeEnd: event.target.value,
                })
              }
            />
          </label>
        </div>
      )}
      <button type="submit" title="Сохранить" aria-label="Сохранить задачу">
        💾
      </button>
      <button
        type="button"
        title="Отмена"
        aria-label="Отменить редактирование задачи"
        onClick={() => setTaskRowDraft(null)}
      >
        ✕
      </button>
    </form>
  );

  const periodTabs = (
    <div className="period-tabs" role="group" aria-label="Период">
      {(
        [
          ["day", "День"],
          ["week", "Неделя"],
          ["month", "Месяц"],
          ["year", "Год"],
        ] as const
      ).map(([period, label]) => (
        <button
          key={period}
          className={reportPeriod === period ? "active" : ""}
          onClick={() => setReportPeriod(period)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <span>
            My Work Day<small>Личный рабочий день</small>
          </span>
        </div>
        <nav aria-label="Основная навигация" className="navigation">
          {(
            [
              ["tasks", "Задачи", "☑"],
              ["calendar", "Календарь", "▦"],
              ["statistics", "Статистика", "◫"],
              ["reports", "Отчёты", "▤"],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              className={view === key ? "nav-button active" : "nav-button"}
              onClick={() => setView(key)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>
              {view === "tasks"
                ? "Задачи дня"
                : view === "calendar"
                  ? "Календарь"
                  : view === "statistics"
                    ? "Статистика"
                    : "Отчёт"}
            </h1>
            <p className="subtitle">
              {view === "reports"
                ? "Формирование отчета за период"
                : view === "statistics"
                  ? "Показатели за выбранный период"
                  : formatDate(selectedDate, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
            </p>
          </div>
        </header>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {!ready ? (
          <p className="loading">Загрузка данных…</p>
        ) : (
          <>
            <div className="date-toolbar">
              <button
                aria-label="Предыдущий период"
                onClick={() => moveSelectedDate(-1)}
              >
                ‹
              </button>
              <label>
                {view === "tasks" || view === "calendar"
                  ? "Дата"
                  : reportPeriod === "day"
                    ? "День"
                    : reportPeriod === "week"
                      ? "Неделя"
                      : reportPeriod === "month"
                        ? "Месяц"
                        : "Год"}
                {view === "tasks" ||
                view === "calendar" ||
                reportPeriod === "day" ? (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      if (event.target.value)
                        setSelectedDate(event.target.value);
                    }}
                  />
                ) : reportPeriod === "week" ? (
                  <input
                    type="week"
                    value={isoWeekKey(selectedDate)}
                    onChange={(event) => {
                      const monday = dateFromIsoWeekKey(event.target.value);
                      if (monday) setSelectedDate(monday);
                    }}
                  />
                ) : reportPeriod === "month" ? (
                  <input
                    type="month"
                    value={selectedDate.slice(0, 7)}
                    onChange={(event) => {
                      if (event.target.value)
                        setSelectedDate(`${event.target.value}-01`);
                    }}
                  />
                ) : (
                  <input
                    key={selectedDate.slice(0, 4)}
                    type="number"
                    min="1000"
                    max="9999"
                    step="1"
                    defaultValue={selectedDate.slice(0, 4)}
                    onBlur={(event) => {
                      const year = event.target.value;
                      if (/^\d{4}$/.test(year) && Number(year) >= 1000) {
                        setSelectedDate(`${year}-01-01`);
                      } else {
                        event.currentTarget.value = selectedDate.slice(0, 4);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                )}
              </label>
              <button
                aria-label="Следующий период"
                onClick={() => moveSelectedDate(1)}
              >
                ›
              </button>
              <button
                className="today-button"
                onClick={() => setSelectedDate(dateKey(new Date()))}
              >
                Сегодня
              </button>
            </div>

            {view === "tasks" && (
              <div className="task-workspace">
                {projects.length > 0 && (
                  <section className="panel project-filter">
                    <label>
                      Проект
                      <select
                        value={projectFilter}
                        onChange={(event) =>
                          setProjectFilter(event.target.value)
                        }
                      >
                        <option value="">Все проекты</option>
                        {projects.map((project) => (
                          <option value={project} key={project}>
                            {project}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                )}
                <div className="board">
                  {(["todo", "doing", "done"] as const).map((status) => (
                    <section className="board-column" key={status}>
                      <h2>
                        <span className={`status-dot ${status}`} />
                        {status === "todo"
                          ? "Сделать"
                          : status === "doing"
                            ? "В работе"
                            : "Готово"}{" "}
                        {status === "todo" && (
                          <button
                            className="board-add-button"
                            aria-label="Добавить задачу на выбранный день"
                            title="Добавить задачу"
                            onClick={() => {
                              setQuickTaskProject(projectFilter);
                              setIsAddingDayTask((isAdding) => !isAdding);
                            }}
                          >
                            +
                          </button>
                        )}
                        <span className="count">
                          {
                            visibleDayTasks.filter(
                              (task) => task.status === status,
                            ).length
                          }
                        </span>
                      </h2>
                      <div className="card-stack">
                        {status === "todo" && isAddingDayTask && quickTaskForm}
                        {visibleDayTasks
                          .filter((task) => task.status === status)
                          .map((task) =>
                            taskRowDraft?.id === task.id ? (
                              taskRowEditor
                            ) : (
                              <div
                                className={`hub-day-row ${task.status === "done" ? "is-done" : ""}`}
                                key={task.id}
                              >
                                <button
                                  className="mini-action"
                                  aria-label={
                                    task.status === "done"
                                      ? `Вернуть задачу ${task.title} в работу`
                                      : task.status === "todo"
                                        ? `Перевести задачу ${task.title} в работу`
                                        : `Вернуть задачу ${task.title} в список сделать`
                                  }
                                  title={
                                    task.status === "done"
                                      ? "Вернуть в работу"
                                      : task.status === "todo"
                                        ? "В работу"
                                        : "Вернуть в сделать"
                                  }
                                  onClick={() =>
                                    setTaskStatus(
                                      task,
                                      task.status === "doing"
                                        ? "todo"
                                        : "doing",
                                    )
                                  }
                                >
                                  {task.status === "done"
                                    ? "↺"
                                    : task.status === "todo"
                                      ? "→"
                                      : "←"}
                                </button>
                                {task.status !== "done" && (
                                  <button
                                    className="mini-action"
                                    title="Отметить выполненной"
                                    aria-label={`Отметить задачу ${task.title} выполненной`}
                                    onClick={() => setTaskStatus(task, "done")}
                                  >
                                    ✓
                                  </button>
                                )}
                                <span className="hub-row-title">
                                  {task.title}
                                  {task.note && (
                                    <small className="task-list-note">
                                      {task.note}
                                    </small>
                                  )}
                                </span>
                                {task.project && (
                                  <span className="task-tag">
                                    {task.project}
                                  </span>
                                )}
                                {task.dueTime && (
                                  <small>🕑 {task.dueTime}</small>
                                )}
                                {task.estimateMinutes > 0 && (
                                  <small>
                                    План: {minutesLabel(task.estimateMinutes)}
                                  </small>
                                )}
                                <button
                                  className="mini-action"
                                  title="Редактировать"
                                  aria-label={`Редактировать задачу ${task.title}`}
                                  onClick={() => editTaskRow(task)}
                                >
                                  ✎
                                </button>
                                <button
                                  className="mini-action danger-text"
                                  title="Удалить"
                                  aria-label={`Удалить задачу ${task.title}`}
                                  onClick={() => deleteTask(task)}
                                >
                                  ✕
                                </button>
                              </div>
                            ),
                          )}
                        {!visibleDayTasks.some(
                          (task) => task.status === status,
                        ) &&
                          !(status === "todo" && isAddingDayTask) && (
                            <p className="empty-column">Здесь пока пусто</p>
                          )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {view === "calendar" && (
              <div className="calendar-page">
                <div className="calendar-workspace">
                  <section className="panel calendar-panel">
                    <div className="section-heading calendar-heading">
                      <h2>
                        {formatDate(selectedDate, {
                          month: "long",
                          year: "numeric",
                        })}
                      </h2>
                      <div>
                        <button
                          aria-label="Предыдущий месяц"
                          onClick={() => moveMonth(-1)}
                        >
                          ‹
                        </button>
                        <button
                          aria-label="Следующий месяц"
                          onClick={() => moveMonth(1)}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    <div className="calendar-grid">
                      {weekDays.map((day) => (
                        <div className="weekday" key={day}>
                          {day}
                        </div>
                      ))}
                      {calendarDays.map((day) => {
                        const planned = tasks.filter(
                          (task) => task.date === day,
                        );
                        const done = tasks.filter((task) =>
                          task.completedAt
                            ? dateKeyFromTimestamp(task.completedAt) === day
                            : false,
                        ).length;
                        const minutes = entries
                          .filter((entry) => entry.date === day)
                          .reduce((sum, entry) => sum + entry.minutes, 0);
                        return (
                          <button
                            key={day}
                            className={`calendar-day ${parseDate(day).getMonth() !== month ? "outside" : ""} ${day === selectedDate ? "selected" : ""} ${day === currentDay ? "is-today" : ""}`}
                            onClick={() => setSelectedDate(day)}
                          >
                            <span>{parseDate(day).getDate()}</span>
                            <small>
                              {planned.length > 0 && `${planned.length} план`}
                            </small>
                            <small>{done > 0 && `${done} готово`}</small>
                            <small>
                              {minutes > 0 && minutesLabel(minutes)}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="panel calendar-tasks-panel">
                    <div className="section-heading">
                      <h2>Задачи дня</h2>
                      <button
                        className="board-add-button"
                        aria-label="Добавить задачу на выбранный день"
                        title="Добавить задачу"
                        onClick={() => {
                          setQuickTaskProject("");
                          setIsAddingDayTask((isAdding) => !isAdding);
                        }}
                      >
                        +
                      </button>
                      <strong>
                        {calendarCompletedCount} из {calendarDayTasks.length}{" "}
                        готово
                      </strong>
                    </div>
                    {isAddingDayTask && quickTaskForm}
                    {calendarDayTasks.length === 0 && !isAddingDayTask ? (
                      <p className="empty-state">На этот день задач нет.</p>
                    ) : (
                      calendarDayTasks.map((task) =>
                        taskRowDraft?.id === task.id ? (
                          taskRowEditor
                        ) : (
                          <div
                            className={`hub-day-row ${task.status === "done" ? "is-done" : ""}`}
                            key={task.id}
                          >
                            <button
                              className="mini-action"
                              aria-label={
                                task.status === "done"
                                  ? "Вернуть задачу в работу"
                                  : "Отметить задачу выполненной"
                              }
                              title={
                                task.status === "done"
                                  ? "Вернуть в работу"
                                  : "Отметить выполненной"
                              }
                              onClick={() =>
                                setTaskStatus(
                                  task,
                                  task.status === "done" ? "todo" : "done",
                                )
                              }
                            >
                              {task.status === "done" ? "↺" : "✓"}
                            </button>
                            <span className="hub-row-title">{task.title}</span>
                            {task.project && (
                              <span className="task-tag">{task.project}</span>
                            )}
                            {task.date !== selectedDate && (
                              <span className="task-tag">📅 {task.date}</span>
                            )}
                            {task.dueTime && <small>🕑 {task.dueTime}</small>}
                            <button
                              className="mini-action"
                              title="Редактировать"
                              aria-label={`Редактировать задачу ${task.title}`}
                              onClick={() => editTaskRow(task)}
                            >
                              ✎
                            </button>
                            <button
                              className="mini-action danger-text"
                              title="Удалить"
                              aria-label={`Удалить задачу ${task.title}`}
                              onClick={() => deleteTask(task)}
                            >
                              ✕
                            </button>
                          </div>
                        ),
                      )
                    )}
                    <div className="calendar-time-section">
                      <div className="section-heading">
                        <h3>Учтённое время</h3>
                        <strong>{minutesLabel(dayMinutes)}</strong>
                      </div>
                      {timer && (
                        <div className="hub-day-row active-time-row">
                          <span className="time-duration">…идёт</span>
                          <span className="hub-row-title">{timer.title}</span>
                          {dateKeyFromTimestamp(timer.startedAt) !==
                            selectedDate && (
                            <span className="task-tag">
                              {formatDate(
                                dateKeyFromTimestamp(timer.startedAt),
                                {
                                  day: "numeric",
                                  month: "short",
                                },
                              )}
                            </span>
                          )}
                          <small>
                            {clockTime(new Date(timer.startedAt))}–
                            {clockTime(new Date(now))}
                          </small>
                          <button
                            className="mini-action"
                            title="Остановить и сохранить"
                            aria-label="Остановить таймер и сохранить время"
                            onClick={stopTimer}
                          >
                            ■
                          </button>
                        </div>
                      )}
                      <div className="calendar-time-list">
                        {dayEntries.length === 0 && !timer && (
                          <p className="empty-state">
                            Записей за этот день нет.
                          </p>
                        )}
                        {dayEntries.map((entry) =>
                          editingEntryId === entry.id ? (
                            <form
                              className="hub-edit-row"
                              key={entry.id}
                              onSubmit={saveEntryEdit}
                            >
                              <input
                                aria-label="Название записи"
                                value={entryTitle}
                                onChange={(event) =>
                                  setEntryTitle(event.target.value)
                                }
                                required
                              />
                              {hasEditableClockTimes(entry) ? (
                                <>
                                  <input
                                    aria-label="Начало"
                                    type="time"
                                    value={entryStart}
                                    onChange={(event) =>
                                      setEntryStart(event.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    aria-label="Конец"
                                    type="time"
                                    value={entryEnd}
                                    onChange={(event) =>
                                      setEntryEnd(event.target.value)
                                    }
                                    required
                                  />
                                </>
                              ) : (
                                <input
                                  aria-label="Минуты старой записи"
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={entryMinutes}
                                  onChange={(event) =>
                                    setEntryMinutes(event.target.value)
                                  }
                                  required
                                />
                              )}
                              <button
                                type="submit"
                                title="Сохранить"
                                aria-label="Сохранить запись времени"
                              >
                                💾
                              </button>
                              <button
                                type="button"
                                title="Отмена"
                                aria-label="Отменить редактирование времени"
                                onClick={() => setEditingEntryId(null)}
                              >
                                ✕
                              </button>
                            </form>
                          ) : (
                            <div className="hub-day-row" key={entry.id}>
                              <span className="time-duration">
                                {minutesLabel(entry.minutes)}
                              </span>
                              <span className="hub-row-title">
                                {entry.title}
                              </span>
                              {entry.startTime && (
                                <small>
                                  {entry.startTime}
                                  {entry.endTime && `–${entry.endTime}`}
                                </small>
                              )}
                              <button
                                className="mini-action"
                                title="Редактировать"
                                aria-label={`Редактировать запись ${entry.title}`}
                                onClick={() => editEntry(entry)}
                              >
                                ✎
                              </button>
                              <button
                                className="mini-action danger-text"
                                title="Удалить"
                                aria-label={`Удалить запись ${entry.title}`}
                                onClick={() => deleteEntry(entry)}
                              >
                                ✕
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}

            {view === "statistics" && (
              <div className="statistics-page">
                <section className="panel statistics-period-panel">
                  <div className="section-heading">
                    <h2>{reportTitle(reportPeriod, reportStart, reportEnd)}</h2>
                  </div>
                  {periodTabs}
                  <div className="stats-row">
                    <div className="stat">
                      <span>Запланировано</span>
                      <strong>{reportTasks.length}</strong>
                    </div>
                    <div className="stat">
                      <span>Выполнено</span>
                      <strong>{reportDone.length}</strong>
                    </div>
                    <div className="stat">
                      <span>Учтено времени</span>
                      <strong>{minutesLabel(reportMinutes)}</strong>
                    </div>
                    <div className="stat">
                      <span>Дней с записями</span>
                      <strong>{reportDays}</strong>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {view === "reports" && (
              <>
                {periodTabs}
                <section className="panel report-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">ИТОГИ ПЕРИОДА</p>
                      <h2>Отчёт за период</h2>
                    </div>
                    <button onClick={exportReport}>Скачать .md</button>
                  </div>
                  <div className="report-lists">
                    <div>
                      <h3>Выполненные задачи</h3>
                      {reportDone.length === 0 ? (
                        <p className="empty-state">
                          Пока нет выполненных задач.
                        </p>
                      ) : (
                        reportDone.map((task) => (
                          <div className="report-row" key={task.id}>
                            <span>{task.title}</span>
                            <small>
                              {task.completedAt
                                ? dateKeyFromTimestamp(task.completedAt)
                                : ""}
                            </small>
                          </div>
                        ))
                      )}
                    </div>
                    <div>
                      <h3>Записи времени</h3>
                      {reportEntries.length === 0 ? (
                        <p className="empty-state">Записей времени нет.</p>
                      ) : (
                        reportEntries.map((entry) => (
                          <div className="report-row" key={entry.id}>
                            <span>
                              {entry.title}
                              <small>
                                {formatDate(entry.date, {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </small>
                            </span>
                            <strong>{minutesLabel(entry.minutes)}</strong>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
