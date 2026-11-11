import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  dateKey,
  dateKeyFromTimestamp,
  formatDate,
  minutesLabel,
  mondayOf,
  parseDate,
} from "./dates";
import { database } from "./database";
import type { ActiveTimer, ReportPeriod, Task, TimeEntry } from "./model";
import { entriesFromTimer } from "./timer";

type View = "tasks" | "time" | "calendar" | "reports";

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
  const [entryTitle, setEntryTitle] = useState("");
  const [entryMinutes, setEntryMinutes] = useState("");
  const [entryTaskId, setEntryTaskId] = useState("");
  const [entryDate, setEntryDate] = useState(() => dateKey(new Date()));
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [timerTitle, setTimerTitle] = useState("");
  const [timerTaskId, setTimerTaskId] = useState("");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("week");
  const timerBusy = useRef(false);
  const contentRef = useRef<HTMLElement>(null);
  const currentDay = dateKey(new Date(now));

  useEffect(() => {
    if (!editingTaskId) setTaskDate(selectedDate);
    if (!editingEntryId) setEntryDate(selectedDate);
  }, [selectedDate, editingTaskId, editingEntryId]);

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
  const completedCount = dayTasks.filter(
    (task) => task.status === "done",
  ).length;
  const projects = Array.from(
    new Set(tasks.map((task) => task.project).filter(Boolean)),
  ).sort();
  const visibleDayTasks = projectFilter
    ? dayTasks.filter((task) => task.project === projectFilter)
    : dayTasks;
  const activeSeconds = timer
    ? Math.max(0, Math.floor((now - Date.parse(timer.startedAt)) / 1000))
    : 0;

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
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
  }

  function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = Math.round(Number(entryMinutes));
    if (!entryTitle.trim() || !Number.isFinite(minutes) || minutes < 1) return;

    const existing = entries.find((entry) => entry.id === editingEntryId);
    const entry: TimeEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      taskId: entryTaskId || null,
      title: entryTitle.trim(),
      date: entryDate,
      minutes,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    void change(() => database.saveEntry(entry)).then((saved) => {
      if (saved) {
        resetEntryForm();
      }
    });
  }

  function resetEntryForm() {
    setEntryTitle("");
    setEntryMinutes("");
    setEntryTaskId("");
    setEntryDate(selectedDate);
    setEditingEntryId(null);
  }

  function editEntry(entry: TimeEntry) {
    setEntryTitle(entry.title);
    setEntryMinutes(String(entry.minutes));
    setEntryTaskId(entry.taskId ?? "");
    setEntryDate(entry.date);
    setEditingEntryId(entry.id);
    setSelectedDate(entry.date);
    setView("time");
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteEntry(entry: TimeEntry) {
    if (!window.confirm(`Удалить запись «${entry.title}»?`)) return;
    void change(() => database.deleteEntry(entry.id));
  }

  function startTimer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timerBusy.current || timer) return;
    const linkedTask = tasks.find((task) => task.id === timerTaskId);
    const title = timerTitle.trim() || linkedTask?.title || "";
    if (!title) return;

    const activeTimer: ActiveTimer = {
      id: "activeTimer",
      title,
      taskId: linkedTask?.id ?? null,
      startedAt: new Date().toISOString(),
    };
    timerBusy.current = true;
    void change(() => database.saveTimer(activeTimer)).then(() => {
      timerBusy.current = false;
      setNow(Date.now());
    });
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
      `# Todo / Did — ${title}`,
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✓</span>
          <span>
            Todo <em>/</em> Did<small>Личный рабочий день</small>
          </span>
        </div>
        <nav aria-label="Основная навигация" className="navigation">
          {(
            [
              ["tasks", "Задачи", "☑"],
              ["time", "Время", "◷"],
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
        <div className="sidebar-note">
          Данные хранятся в этом браузере с помощью IndexedDB.
        </div>
      </aside>

      <main className="main-content" ref={contentRef}>
        <header className="page-header">
          <div>
            <p className="eyebrow">TODO / DID</p>
            <h1>
              {view === "tasks"
                ? "Задачи дня"
                : view === "time"
                  ? "Учёт времени"
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
          <button
            className="today-button"
            onClick={() => setSelectedDate(dateKey(new Date()))}
          >
            Сегодня
          </button>
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
              </div>
            )}

            {view === "tasks" && (
              <div className="task-workspace">
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
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        {editingTaskId
                          ? "Редактировать задачу"
                          : "Новая задача"}
                      </h2>
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
                          onChange={(event) =>
                            setTaskProject(event.target.value)
                          }
                          placeholder="Необязательно"
                        />
                      </label>
                      <label>
                        Время срока
                        <input
                          type="time"
                          value={taskDueTime}
                          onChange={(event) =>
                            setTaskDueTime(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        План, минут
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={taskEstimate}
                          onChange={(event) =>
                            setTaskEstimate(event.target.value)
                          }
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
                  {projects.length > 0 && (
                    <div className="project-filter">
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
                    </div>
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

            {view === "time" && (
              <div className="two-column">
                <div className="column-flow">
                  <section className="panel timer-panel">
                    <div className="section-heading">
                      <h2>Таймер</h2>
                      <span className="pill">
                        {timer ? "Идёт запись" : "Готов к работе"}
                      </span>
                    </div>
                    {timer ? (
                      <div className="running-timer">
                        <strong>
                          {String(Math.floor(activeSeconds / 3600)).padStart(
                            2,
                            "0",
                          )}
                          :
                          {String(Math.floor(activeSeconds / 60) % 60).padStart(
                            2,
                            "0",
                          )}
                          :{String(activeSeconds % 60).padStart(2, "0")}
                        </strong>
                        <p>{timer.title}</p>
                        <button className="primary-button" onClick={stopTimer}>
                          Остановить и сохранить
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={startTimer} className="stacked-form">
                        <label>
                          Задача
                          <select
                            value={timerTaskId}
                            onChange={(event) =>
                              setTimerTaskId(event.target.value)
                            }
                          >
                            <option value="">Без задачи</option>
                            {tasks
                              .filter((task) => task.status !== "done")
                              .map((task) => (
                                <option key={task.id} value={task.id}>
                                  {task.title}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Название записи
                          <input
                            value={timerTitle}
                            onChange={(event) =>
                              setTimerTitle(event.target.value)
                            }
                            placeholder="Например, работа над проектом"
                          />
                        </label>
                        <button
                          className="primary-button"
                          disabled={!timerTitle.trim() && !timerTaskId}
                        >
                          Запустить таймер
                        </button>
                      </form>
                    )}
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        {editingEntryId
                          ? "Редактировать запись"
                          : "Добавить время вручную"}
                      </h2>
                    </div>
                    <form onSubmit={saveEntry} className="stacked-form">
                      <label>
                        Дата записи
                        <input
                          type="date"
                          value={entryDate}
                          onChange={(event) => setEntryDate(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Название
                        <input
                          value={entryTitle}
                          onChange={(event) =>
                            setEntryTitle(event.target.value)
                          }
                          placeholder="Что было сделано?"
                          required
                        />
                      </label>
                      <label>
                        Задача
                        <select
                          value={entryTaskId}
                          onChange={(event) =>
                            setEntryTaskId(event.target.value)
                          }
                        >
                          <option value="">Без задачи</option>
                          {tasks.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Минуты
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={entryMinutes}
                          onChange={(event) =>
                            setEntryMinutes(event.target.value)
                          }
                          required
                        />
                      </label>
                      <div className="form-actions">
                        <button className="primary-button">
                          {editingEntryId
                            ? "Сохранить изменения"
                            : "Сохранить время"}
                        </button>
                        {editingEntryId && (
                          <button type="button" onClick={resetEntryForm}>
                            Отмена
                          </button>
                        )}
                      </div>
                    </form>
                  </section>
                </div>
                <section className="panel entries-panel">
                  <div className="section-heading">
                    <h2>Записи за день</h2>
                    <strong>{minutesLabel(dayMinutes)}</strong>
                  </div>
                  {dayEntries.length === 0 ? (
                    <p className="empty-state">
                      За этот день пока нет записей времени.
                    </p>
                  ) : (
                    dayEntries.map((entry) => (
                      <div className="entry-row" key={entry.id}>
                        <div>
                          <strong>{entry.title}</strong>
                          <small>
                            {tasks.find((task) => task.id === entry.taskId)
                              ?.title ?? "Без задачи"}
                          </small>
                        </div>
                        <span>{minutesLabel(entry.minutes)}</span>
                        <button onClick={() => editEntry(entry)}>
                          Изменить
                        </button>
                        <button
                          className="danger-text"
                          onClick={() => deleteEntry(entry)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))
                  )}
                </section>
              </div>
            )}

            {view === "calendar" && (
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
                      const planned = tasks.filter((task) => task.date === day);
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
                          <small>{minutes > 0 && minutesLabel(minutes)}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section className="panel day-details">
                  <div className="section-heading">
                    <h2>
                      {formatDate(selectedDate, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </h2>
                    <button onClick={() => setView("tasks")}>
                      Открыть задачи →
                    </button>
                  </div>
                  <div className="day-detail-grid">
                    <div>
                      <h3>Задачи ({dayTasks.length})</h3>
                      {dayTasks.length === 0 ? (
                        <p className="empty-state">Задач нет.</p>
                      ) : (
                        dayTasks.map((task) => (
                          <div className="detail-row" key={task.id}>
                            <span className={`status-dot ${task.status}`} />
                            <span>{task.title}</span>
                            <small>
                              {task.status === "done"
                                ? "Готово"
                                : task.status === "doing"
                                  ? "В работе"
                                  : "Сделать"}
                            </small>
                          </div>
                        ))
                      )}
                      <h3 className="detail-subheading">
                        Выполнено за день ({dayCompleted.length})
                      </h3>
                      {dayCompleted.length === 0 ? (
                        <p className="empty-state">Выполненных задач нет.</p>
                      ) : (
                        dayCompleted.map((task) => (
                          <div className="detail-row" key={task.id}>
                            <span className="status-dot done" />
                            <span>{task.title}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div>
                      <h3>Время ({minutesLabel(dayMinutes)})</h3>
                      {dayEntries.length === 0 ? (
                        <p className="empty-state">Записей нет.</p>
                      ) : (
                        dayEntries.map((entry) => (
                          <div className="detail-row" key={entry.id}>
                            <span>{entry.title}</span>
                            <small>{minutesLabel(entry.minutes)}</small>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
