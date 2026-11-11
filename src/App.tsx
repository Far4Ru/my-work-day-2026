import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  clockTime,
  dateKey,
  dateKeyFromTimestamp,
  formatDate,
  minutesBetweenTimes,
  minutesLabel,
  mondayOf,
  parseDate,
} from "./dates";
import { database } from "./database";
import type { ActiveTimer, ReportPeriod, Task, TimeEntry } from "./model";
import { entriesFromTimer } from "./timer";

type View = "tasks" | "calendar" | "reports";

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
  const [taskTitle, setTaskTitle] = useState("");
  const [taskProject, setTaskProject] = useState("");
  const [taskNote, setTaskNote] = useState("");
  const [taskDueTime, setTaskDueTime] = useState("");
  const [taskEstimate, setTaskEstimate] = useState("");
  const [taskDate, setTaskDate] = useState(() => dateKey(new Date()));
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [quickTaskProject, setQuickTaskProject] = useState("");
  const [quickTaskDueTime, setQuickTaskDueTime] = useState("");
  const [calendarTaskDraft, setCalendarTaskDraft] = useState<{
    id: string;
    title: string;
    project: string;
    date: string;
    dueTime: string;
  } | null>(null);
  const [quickTimeTitle, setQuickTimeTitle] = useState("");
  const [quickTimeStart, setQuickTimeStart] = useState("");
  const [quickTimeEnd, setQuickTimeEnd] = useState("");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryMinutes, setEntryMinutes] = useState("");
  const [entryStart, setEntryStart] = useState("");
  const [entryEnd, setEntryEnd] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("week");
  const timerBusy = useRef(false);
  const taskEditorRef = useRef<HTMLElement>(null);
  const currentDay = dateKey(new Date(now));

  useEffect(() => {
    if (!editingTaskId) setTaskDate(selectedDate);
    setCalendarTaskDraft(null);
    setEditingEntryId(null);
  }, [selectedDate, editingTaskId]);

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
  const completedCount = dayTasks.filter(
    (task) => task.status === "done",
  ).length;
  const projects = Array.from(
    new Set(tasks.map((task) => task.project).filter(Boolean)),
  ).sort();
  const visibleDayTasks = projectFilter
    ? dayTasks.filter((task) => task.project === projectFilter)
    : dayTasks;

  function resetTaskForm() {
    setTaskTitle("");
    setTaskProject("");
    setTaskNote("");
    setTaskDueTime("");
    setTaskEstimate("");
    setTaskDate(selectedDate);
    setEditingTaskId(null);
  }

  function editTask(task: Task) {
    setTaskTitle(task.title);
    setTaskProject(task.project);
    setTaskNote(task.note);
    setTaskDueTime(task.dueTime);
    setTaskEstimate(task.estimateMinutes ? String(task.estimateMinutes) : "");
    setTaskDate(task.date);
    setEditingTaskId(task.id);
    setSelectedDate(task.date);
    setView("tasks");
    window.requestAnimationFrame(() =>
      taskEditorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }

  function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;

    const existing = tasks.find((task) => task.id === editingTaskId);
    const task: Task = {
      id: existing?.id ?? crypto.randomUUID(),
      title,
      project: taskProject.trim(),
      note: taskNote.trim(),
      date: taskDate,
      dueTime: taskDueTime,
      estimateMinutes: Math.max(0, Number(taskEstimate) || 0),
      status: existing?.status ?? "todo",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      completedAt: existing?.completedAt ?? null,
    };

    void change(() => database.saveTask(task)).then((saved) => {
      if (saved) resetTaskForm();
    });
  }

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
    if (editingTaskId === task.id) resetTaskForm();
    if (calendarTaskDraft?.id === task.id) setCalendarTaskDraft(null);
  }

  function addCalendarTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickTaskTitle.trim()) return;

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

    void change(() => database.saveTask(task)).then((saved) => {
      if (saved) {
        setQuickTaskTitle("");
        setQuickTaskProject("");
        setQuickTaskDueTime("");
      }
    });
  }

  function editCalendarTask(task: Task) {
    setCalendarTaskDraft({
      id: task.id,
      title: task.title,
      project: task.project,
      date: task.date,
      dueTime: task.dueTime,
    });
  }

  function saveCalendarTaskEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!calendarTaskDraft?.title.trim()) return;
    const existing = tasks.find((task) => task.id === calendarTaskDraft.id);
    if (!existing) return;

    const updated: Task = {
      ...existing,
      title: calendarTaskDraft.title.trim(),
      project: calendarTaskDraft.project.trim(),
      date: calendarTaskDraft.date,
      dueTime: calendarTaskDraft.dueTime,
    };
    void change(() => database.saveTask(updated)).then((saved) => {
      if (saved) setCalendarTaskDraft(null);
    });
  }

  function addCalendarTime(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = quickTimeTitle.trim();
    if (!title || !quickTimeStart) return;

    if (quickTimeEnd) {
      const minutes = minutesBetweenTimes(quickTimeStart, quickTimeEnd);
      if (minutes === null) {
        setError("Конец записи должен быть позже начала.");
        return;
      }

      const entry: TimeEntry = {
        id: crypto.randomUUID(),
        taskId: null,
        title,
        date: selectedDate,
        minutes,
        startTime: quickTimeStart,
        endTime: quickTimeEnd,
        createdAt: new Date().toISOString(),
      };
      void change(() => database.saveEntry(entry)).then((saved) => {
        if (saved) {
          setQuickTimeTitle("");
          setQuickTimeStart("");
          setQuickTimeEnd("");
        }
      });
      return;
    }

    if (selectedDate !== currentDay || timer || timerBusy.current) {
      setError(
        "Запись без конца можно начать только сегодня, если таймер свободен.",
      );
      return;
    }

    const startedAt = parseDate(selectedDate);
    const [hours, minutes] = quickTimeStart.split(":").map(Number);
    startedAt.setHours(hours, minutes, 0, 0);
    if (startedAt.getTime() > Date.now()) {
      setError("Время начала не может быть в будущем.");
      return;
    }

    const activeTimer: ActiveTimer = {
      id: "activeTimer",
      taskId: null,
      title,
      startedAt: startedAt.toISOString(),
    };
    timerBusy.current = true;
    void change(() => database.saveTimer(activeTimer)).then((saved) => {
      timerBusy.current = false;
      if (saved) {
        setQuickTimeTitle("");
        setQuickTimeStart("");
        setNow(Date.now());
      }
    });
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
    if (view !== "reports" || reportPeriod === "day") {
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

  const taskEditor = (
    <section className="panel task-editor-panel" ref={taskEditorRef}>
      <div className="section-heading">
        <h2>{editingTaskId ? "Редактировать задачу" : "Новая задача"}</h2>
      </div>
      <form onSubmit={saveTask} className="task-form">
        <label>
          Дата задачи
          <input
            type="date"
            value={taskDate}
            onChange={(event) => setTaskDate(event.target.value)}
            required
          />
        </label>
        <label className="wide-field">
          Название
          <input
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            placeholder="Что нужно сделать?"
            required
          />
        </label>
        <label>
          Проект
          <input
            value={taskProject}
            onChange={(event) => setTaskProject(event.target.value)}
            placeholder="Необязательно"
          />
        </label>
        <label>
          Время срока
          <input
            type="time"
            value={taskDueTime}
            onChange={(event) => setTaskDueTime(event.target.value)}
          />
        </label>
        <label>
          План, минут
          <input
            type="number"
            min="0"
            step="1"
            value={taskEstimate}
            onChange={(event) => setTaskEstimate(event.target.value)}
            placeholder="Необязательно"
          />
        </label>
        <label className="wide-field">
          Заметка
          <textarea
            value={taskNote}
            onChange={(event) => setTaskNote(event.target.value)}
            placeholder="Детали задачи"
            rows={2}
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="primary-button">
            {editingTaskId ? "Сохранить" : "Добавить задачу"}
          </button>
          {editingTaskId && (
            <button type="button" onClick={resetTaskForm}>
              Отмена
            </button>
          )}
        </div>
      </form>
    </section>
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
                  : "Отчёт"}
            </h1>
            <p className="subtitle">
              {view === "reports"
                ? "Итоги ваших задач и работы"
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
            {view !== "calendar" && (
              <div className="date-toolbar">
                <button
                  aria-label="Предыдущий период"
                  onClick={() => moveSelectedDate(-1)}
                >
                  ‹
                </button>
                <label>
                  Дата{" "}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      if (event.target.value)
                        setSelectedDate(event.target.value);
                    }}
                  />
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
            )}

            {view === "tasks" && (
              <div className="task-workspace">
                <div className="task-workspace-left">
                  <div className="task-workspace-controls">
                    <div className="stats-row">
                      <div className="stat">
                        <span>Задач на день</span>
                        <strong>{dayTasks.length}</strong>
                      </div>
                      <div className="stat">
                        <span>Выполнено</span>
                        <strong>{completedCount}</strong>
                      </div>
                      <div className="stat">
                        <span>Учтено времени</span>
                        <strong>{minutesLabel(dayMinutes)}</strong>
                      </div>
                    </div>
                  </div>
                  {taskEditor}
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
                </div>
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
                        <span className="count">
                          {
                            visibleDayTasks.filter(
                              (task) => task.status === status,
                            ).length
                          }
                        </span>
                      </h2>
                      <div className="card-stack">
                        {visibleDayTasks
                          .filter((task) => task.status === status)
                          .map((task) => (
                            <article
                              className={`task-card ${status}`}
                              key={task.id}
                            >
                              <h3>{task.title}</h3>
                              {(task.project || task.dueTime) && (
                                <div className="task-meta">
                                  {task.project && <span>{task.project}</span>}
                                  {task.dueTime && (
                                    <span>до {task.dueTime}</span>
                                  )}
                                </div>
                              )}
                              {task.note && <p>{task.note}</p>}
                              {task.estimateMinutes > 0 && (
                                <span className="muted">
                                  План: {minutesLabel(task.estimateMinutes)}
                                </span>
                              )}
                              <div className="card-actions">
                                <select
                                  aria-label={`Статус задачи ${task.title}`}
                                  value={task.status}
                                  onChange={(event) =>
                                    setTaskStatus(
                                      task,
                                      event.target.value as Task["status"],
                                    )
                                  }
                                >
                                  <option value="todo">Сделать</option>
                                  <option value="doing">В работе</option>
                                  <option value="done">Готово</option>
                                </select>
                                <button onClick={() => editTask(task)}>
                                  Изменить
                                </button>
                                <button
                                  className="danger-text"
                                  onClick={() => deleteTask(task)}
                                >
                                  Удалить
                                </button>
                              </div>
                            </article>
                          ))}
                        {!visibleDayTasks.some(
                          (task) => task.status === status,
                        ) && <p className="empty-column">Здесь пока пусто</p>}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {view === "calendar" && (
              <div className="calendar-page">
                <div className="calendar-day-toolbar">
                  <button
                    aria-label="Предыдущий день"
                    onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                  >
                    ‹
                  </button>
                  <strong>
                    {formatDate(selectedDate, {
                      weekday: "short",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                  <button
                    aria-label="Следующий день"
                    onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                  >
                    ›
                  </button>
                  <input
                    aria-label="Выбранная дата"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => {
                      if (event.target.value)
                        setSelectedDate(event.target.value);
                    }}
                  />
                  {selectedDate !== currentDay && (
                    <button onClick={() => setSelectedDate(currentDay)}>
                      сегодня
                    </button>
                  )}
                </div>
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
                  <div className="calendar-day-panels">
                    <section className="panel calendar-add-task-panel">
                      <div className="section-heading">
                        <h2>Новая задача на этот день</h2>
                      </div>
                      <form className="hub-form-row" onSubmit={addCalendarTask}>
                        <input
                          aria-label="Название новой задачи"
                          placeholder="Новая задача на этот день…"
                          value={quickTaskTitle}
                          onChange={(event) =>
                            setQuickTaskTitle(event.target.value)
                          }
                          required
                        />
                        <input
                          aria-label="Проект"
                          placeholder="проект"
                          value={quickTaskProject}
                          onChange={(event) =>
                            setQuickTaskProject(event.target.value)
                          }
                        />
                        <input
                          aria-label="Время дедлайна"
                          title="время дедлайна"
                          type="time"
                          value={quickTaskDueTime}
                          onChange={(event) =>
                            setQuickTaskDueTime(event.target.value)
                          }
                        />
                        <button className="primary-button" type="submit">
                          Добавить
                        </button>
                      </form>
                    </section>
                    <section className="panel calendar-tasks-panel">
                      <div className="section-heading">
                        <h2>Задачи дня</h2>
                        <strong>
                          {calendarCompletedCount} из {calendarDayTasks.length}{" "}
                          готово
                        </strong>
                      </div>
                      {calendarDayTasks.length === 0 ? (
                        <p className="empty-state">На этот день задач нет.</p>
                      ) : (
                        calendarDayTasks.map((task) =>
                          calendarTaskDraft?.id === task.id ? (
                            <form
                              className="hub-edit-row"
                              key={task.id}
                              onSubmit={saveCalendarTaskEdit}
                            >
                              <input
                                aria-label="Название задачи"
                                value={calendarTaskDraft.title}
                                onChange={(event) =>
                                  setCalendarTaskDraft({
                                    ...calendarTaskDraft,
                                    title: event.target.value,
                                  })
                                }
                                required
                              />
                              <input
                                aria-label="Проект"
                                placeholder="проект"
                                value={calendarTaskDraft.project}
                                onChange={(event) =>
                                  setCalendarTaskDraft({
                                    ...calendarTaskDraft,
                                    project: event.target.value,
                                  })
                                }
                              />
                              <input
                                aria-label="Дата задачи"
                                type="date"
                                value={calendarTaskDraft.date}
                                onChange={(event) =>
                                  setCalendarTaskDraft({
                                    ...calendarTaskDraft,
                                    date: event.target.value,
                                  })
                                }
                                required
                              />
                              <input
                                aria-label="Время дедлайна"
                                type="time"
                                value={calendarTaskDraft.dueTime}
                                onChange={(event) =>
                                  setCalendarTaskDraft({
                                    ...calendarTaskDraft,
                                    dueTime: event.target.value,
                                  })
                                }
                              />
                              <button
                                type="submit"
                                title="Сохранить"
                                aria-label="Сохранить задачу"
                              >
                                💾
                              </button>
                              <button
                                type="button"
                                title="Отмена"
                                aria-label="Отменить редактирование задачи"
                                onClick={() => setCalendarTaskDraft(null)}
                              >
                                ✕
                              </button>
                            </form>
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
                              <span className="hub-row-title">
                                {task.title}
                              </span>
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
                                onClick={() => editCalendarTask(task)}
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
                    </section>
                  </div>
                </div>
                <section className="panel calendar-time-panel">
                  <div className="section-heading">
                    <h2>Учёт времени</h2>
                    <strong>{minutesLabel(dayMinutes)}</strong>
                  </div>
                  {timer && (
                    <div className="hub-day-row active-time-row">
                      <span className="time-duration">…идёт</span>
                      <span className="hub-row-title">{timer.title}</span>
                      {dateKeyFromTimestamp(timer.startedAt) !==
                        selectedDate && (
                        <span className="task-tag">
                          {formatDate(dateKeyFromTimestamp(timer.startedAt), {
                            day: "numeric",
                            month: "short",
                          })}
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
                      <p className="empty-state">Записей за этот день нет.</p>
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
                          <span className="hub-row-title">{entry.title}</span>
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
                  <form className="hub-form-row" onSubmit={addCalendarTime}>
                    <input
                      aria-label="Чем занимались"
                      placeholder="Чем занимались…"
                      value={quickTimeTitle}
                      onChange={(event) =>
                        setQuickTimeTitle(event.target.value)
                      }
                      required
                    />
                    <input
                      aria-label="Начало"
                      title="начало"
                      type="time"
                      value={quickTimeStart}
                      onChange={(event) =>
                        setQuickTimeStart(event.target.value)
                      }
                      required
                    />
                    <input
                      aria-label="Конец"
                      title="конец (пусто = идёт)"
                      type="time"
                      value={quickTimeEnd}
                      onChange={(event) => setQuickTimeEnd(event.target.value)}
                    />
                    <button className="primary-button" type="submit">
                      Добавить
                    </button>
                  </form>
                </section>
              </div>
            )}

            {view === "reports" && (
              <>
                <div
                  className="period-tabs"
                  role="group"
                  aria-label="Период отчёта"
                >
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
                <section className="panel report-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">ИТОГИ ПЕРИОДА</p>
                      <h2>
                        {reportTitle(reportPeriod, reportStart, reportEnd)}
                      </h2>
                    </div>
                    <button onClick={exportReport}>Скачать .md</button>
                  </div>
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
