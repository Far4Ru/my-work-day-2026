import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { edgeAction } from "./boardNavigation";
import type { CarouselDirection } from "./boardNavigation";
import { database } from "./database";
import type {
  ActiveTimer,
  Board,
  ReportPeriod,
  Task,
  TimeEntry,
} from "./model";
import { scheduleTask, unscheduleTask } from "./taskSchedule";
import { entriesFromTimer } from "./timer";

type View = "tasks" | "calendar" | "statistics" | "reports";
type IconName =
  | "tasks"
  | "calendar"
  | "statistics"
  | "reports"
  | "chevron-left"
  | "chevron-right"
  | "plus"
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "restore"
  | "edit"
  | "delete"
  | "save"
  | "close"
  | "clock"
  | "stop"
  | "date";

function Icon({ name }: { name: IconName }) {
  return (
    <img
      className="icon"
      src={`${import.meta.env.BASE_URL}icons/${name}.svg`}
      alt=""
      aria-hidden="true"
    />
  );
}

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

interface BoardContentProps {
  board: Board;
  onRenameBoard: (id: string, name: string) => Promise<boolean>;
  onDeleteBoard: (id: string) => Promise<boolean>;
  onOpenBoardGrid: () => void;
}

function BoardContent({
  board,
  onRenameBoard,
  onDeleteBoard,
  onOpenBoardGrid,
}: BoardContentProps) {
  const boardDatabase = useMemo(() => database.forBoard(board.id), [board.id]);
  const [boardNameDraft, setBoardNameDraft] = useState(board.name);
  const [editingBoardName, setEditingBoardName] = useState(false);
  const [confirmingBoardDelete, setConfirmingBoardDelete] = useState(false);
  const boardNameInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("tasks");
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [quickTaskProject, setQuickTaskProject] = useState("");
  const [quickTaskDueTime, setQuickTaskDueTime] = useState("");
  const [showQuickTimeFields, setShowQuickTimeFields] = useState(false);
  const [isAddingDayTask, setIsAddingDayTask] = useState(false);
  const [isAddingUnscheduledTask, setIsAddingUnscheduledTask] = useState(false);
  const [unscheduledTaskTitle, setUnscheduledTaskTitle] = useState("");
  const [unscheduledTaskProject, setUnscheduledTaskProject] = useState("");
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
    setBoardNameDraft(board.name);
  }, [board.name]);

  useEffect(() => {
    if (editingBoardName) {
      boardNameInput.current?.focus();
      boardNameInput.current?.select();
    }
  }, [editingBoardName]);

  async function saveBoardName(): Promise<void> {
    const trimmed = boardNameDraft.trim();
    if (!trimmed) {
      setBoardNameDraft(board.name);
      setEditingBoardName(false);
      return;
    }
    if (trimmed === board.name) {
      setEditingBoardName(false);
      return;
    }

    const saved = await onRenameBoard(board.id, trimmed);
    if (saved) {
      setEditingBoardName(false);
    }
  }

  useEffect(() => {
    setIsAddingDayTask(false);
    setIsAddingUnscheduledTask(false);
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
      boardDatabase.tasks(),
      boardDatabase.entries(),
      boardDatabase.activeTimer(),
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
  const unscheduledTasks = useMemo(
    () =>
      tasks
        .filter((task) => !task.date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [tasks],
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
  const dayCompleted = tasks.filter(
    (task) =>
      task.date !== null &&
      task.completedAt !== null &&
      dateKeyFromTimestamp(task.completedAt) === selectedDate,
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
  function setTaskStatus(task: Task, status: Task["status"]) {
    const updated: Task = {
      ...task,
      status,
      completedAt: status === "done" ? new Date().toISOString() : null,
    };
    void change(() => boardDatabase.saveTask(updated));
  }

  function deleteTask(task: Task) {
    if (!window.confirm(`Удалить задачу «${task.title}»?`)) return;
    void change(() => boardDatabase.deleteTask(task.id));
    if (taskRowDraft?.id === task.id) setTaskRowDraft(null);
  }

  function moveTaskToSelectedDay(task: Task) {
    void change(() => boardDatabase.saveTask(scheduleTask(task, selectedDate)));
  }

  function moveTaskToAnyDay(task: Task) {
    void change(() => boardDatabase.saveTask(unscheduleTask(task)));
  }

  function addUnscheduledTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!unscheduledTaskTitle.trim() || taskSubmitBusy.current) return;

    const task: Task = {
      id: crypto.randomUUID(),
      title: unscheduledTaskTitle.trim(),
      project: unscheduledTaskProject.trim(),
      note: "",
      date: null,
      dueTime: "",
      estimateMinutes: 0,
      status: "todo",
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    taskSubmitBusy.current = true;
    void change(() => boardDatabase.saveTask(task)).then((saved) => {
      taskSubmitBusy.current = false;
      if (saved) {
        setUnscheduledTaskTitle("");
        setUnscheduledTaskProject("");
        setIsAddingUnscheduledTask(false);
      }
    });
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
    void change(() => boardDatabase.saveTaskWithTime(task, time)).then(
      (saved) => {
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
      },
    );
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
      dueTime: taskRowDraft.date ? taskRowDraft.dueTime : "",
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
    void change(() => boardDatabase.saveTaskWithTime(updated, time)).then(
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
    void change(() => boardDatabase.saveEntry(updated)).then((saved) => {
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
    void change(() => boardDatabase.deleteEntry(entry.id));
    if (editingEntryId === entry.id) setEditingEntryId(null);
  }

  function stopTimer() {
    if (!timer || timerBusy.current) return;
    timerBusy.current = true;
    const timerEntries = entriesFromTimer(timer, new Date());
    void change(() => boardDatabase.finishTimer(timerEntries)).then(() => {
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
  const headerDate =
    view === "tasks" || view === "calendar" || reportPeriod === "day"
      ? formatDate(selectedDate, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : reportTitle(reportPeriod, reportStart, reportEnd);
  const reportTasks = tasks.filter(
    (task) =>
      task.date !== null && task.date >= reportStart && task.date <= reportEnd,
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
    `# My Work Day — ${reportTitle(reportPeriod, reportStart, reportEnd)}`,
    "",
    `Период: ${reportStart} — ${reportEnd}`,
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
          <Icon name="clock" />
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
        <Icon name="save" />
      </button>
      <button
        type="button"
        title="Отмена"
        aria-label="Отменить добавление задачи"
        onClick={() => setIsAddingDayTask(false)}
      >
        <Icon name="close" />
      </button>
    </form>
  );

  const unscheduledTaskForm = (
    <form className="hub-edit-row" onSubmit={addUnscheduledTask}>
      <input
        aria-label="Название задачи без даты"
        placeholder="Новая задача…"
        value={unscheduledTaskTitle}
        onChange={(event) => setUnscheduledTaskTitle(event.target.value)}
        autoFocus
        required
      />
      <input
        aria-label="Проект задачи без даты"
        placeholder="проект"
        value={unscheduledTaskProject}
        onChange={(event) => setUnscheduledTaskProject(event.target.value)}
      />
      <button
        type="submit"
        title="Добавить"
        aria-label="Добавить задачу без даты"
      >
        <Icon name="save" />
      </button>
      <button
        type="button"
        title="Отмена"
        aria-label="Отменить добавление задачи без даты"
        onClick={() => setIsAddingUnscheduledTask(false)}
      >
        <Icon name="close" />
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
        aria-label="Дата задачи, необязательно"
        type="date"
        value={taskRowDraft.date ?? ""}
        onChange={(event) =>
          setTaskRowDraft({
            ...taskRowDraft,
            date: event.target.value || null,
            dueTime: event.target.value ? taskRowDraft.dueTime : "",
            showTimeFields:
              Boolean(event.target.value) && taskRowDraft.showTimeFields,
          })
        }
      />
      {taskRowDraft.date && (
        <input
          aria-label="Время дедлайна"
          type="time"
          value={taskRowDraft.dueTime}
          onChange={(event) =>
            setTaskRowDraft({ ...taskRowDraft, dueTime: event.target.value })
          }
        />
      )}
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
      {view === "calendar" && taskRowDraft.date && (
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
          <Icon name="clock" />
        </button>
      )}
      {view === "calendar" &&
        taskRowDraft.date &&
        taskRowDraft.showTimeFields && (
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
        <Icon name="save" />
      </button>
      <button
        type="button"
        title="Отмена"
        aria-label="Отменить редактирование задачи"
        onClick={() => setTaskRowDraft(null)}
      >
        <Icon name="close" />
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
        <div className="brand-slot">
          <div className="brand" tabIndex={0}>
            <img
              className="brand-mark"
              src={`${import.meta.env.BASE_URL}icons/logo.svg`}
              alt=""
              aria-hidden="true"
            />
            <span>
              My Work Day<small>Личный рабочий день</small>
            </span>
          </div>
          <button
            className="brand-grid-button"
            type="button"
            onClick={onOpenBoardGrid}
          >
            <span className="brand-grid-icon" aria-hidden="true" />
            Все доски
          </button>
        </div>
        <div className="board-identity">
          <div className="board-identity-row">
            <input
              ref={boardNameInput}
              aria-label="Название доски"
              title="Название доски"
              maxLength={80}
              readOnly={!editingBoardName}
              value={boardNameDraft}
              onChange={(event) => setBoardNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && editingBoardName) {
                  void saveBoardName();
                }
                if (event.key === "Escape") {
                  setBoardNameDraft(board.name);
                  setEditingBoardName(false);
                }
              }}
            />
            <button
              type="button"
              aria-label={
                editingBoardName
                  ? "Сохранить название"
                  : "Редактировать название"
              }
              title={editingBoardName ? "Сохранить" : "Редактировать"}
              onClick={() => {
                if (editingBoardName) {
                  void saveBoardName();
                } else {
                  setEditingBoardName(true);
                }
              }}
            >
              <Icon name={editingBoardName ? "save" : "edit"} />
            </button>
          </div>
        </div>
        <nav aria-label="Основная навигация" className="navigation">
          {(
            [
              ["tasks", "Задачи"],
              ["calendar", "Календарь"],
              ["statistics", "Статистика"],
              ["reports", "Отчёты"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={view === key ? "nav-button active" : "nav-button"}
              onClick={() => setView(key)}
            >
              <Icon name={key} />
              {label}
            </button>
          ))}
        </nav>
        <div className="board-delete-area">
          {confirmingBoardDelete ? (
            <div className="board-delete-confirmation">
              <span>Удалить доску и все её данные?</span>
              <div>
                <button
                  type="button"
                  onClick={() => void onDeleteBoard(board.id)}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBoardDelete(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              className="board-delete-button"
              type="button"
              onClick={() => setConfirmingBoardDelete(true)}
            >
              Удалить доску
            </button>
          )}
        </div>
      </aside>

      <main className="main-content">
        <div className="header-date-slot">
          <header className="page-header" tabIndex={0}>
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
              <p className="subtitle">{headerDate}</p>
            </div>
          </header>
          {ready && (
            <div className="date-toolbar">
              <button
                aria-label="Предыдущий период"
                onClick={() => moveSelectedDate(-1)}
              >
                <Icon name="chevron-left" />
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
                <Icon name="chevron-right" />
              </button>
              <button
                className="today-button"
                onClick={() => setSelectedDate(dateKey(new Date()))}
              >
                Сегодня
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {!ready ? (
          <p className="loading">Загрузка данных…</p>
        ) : (
          <>
            {view === "tasks" && (
              <div className="task-workspace">
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
                              setQuickTaskProject("");
                              setIsAddingDayTask((isAdding) => !isAdding);
                            }}
                          >
                            <Icon name="plus" />
                          </button>
                        )}
                        <span className="count">
                          {
                            dayTasks.filter((task) => task.status === status)
                              .length
                          }
                        </span>
                      </h2>
                      <div className="card-stack">
                        {status === "todo" && isAddingDayTask && quickTaskForm}
                        {dayTasks
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
                                  <Icon
                                    name={
                                      task.status === "done"
                                        ? "restore"
                                        : task.status === "todo"
                                          ? "arrow-right"
                                          : "arrow-left"
                                    }
                                  />
                                </button>
                                {task.status !== "done" && (
                                  <button
                                    className="mini-action"
                                    title="Отметить выполненной"
                                    aria-label={`Отметить задачу ${task.title} выполненной`}
                                    onClick={() => setTaskStatus(task, "done")}
                                  >
                                    <Icon name="check" />
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
                                  <small className="icon-label">
                                    <Icon name="clock" /> {task.dueTime}
                                  </small>
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
                                  <Icon name="edit" />
                                </button>
                                <button
                                  className="mini-action danger-text"
                                  title="Удалить"
                                  aria-label={`Удалить задачу ${task.title}`}
                                  onClick={() => deleteTask(task)}
                                >
                                  <Icon name="delete" />
                                </button>
                              </div>
                            ),
                          )}
                        {!dayTasks.some((task) => task.status === status) &&
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
                          <Icon name="chevron-left" />
                        </button>
                        <button
                          aria-label="Следующий месяц"
                          onClick={() => moveMonth(1)}
                        >
                          <Icon name="chevron-right" />
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
                        <Icon name="plus" />
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
                              <Icon
                                name={
                                  task.status === "done" ? "restore" : "check"
                                }
                              />
                            </button>
                            <span className="hub-row-title">{task.title}</span>
                            {task.project && (
                              <span className="task-tag">{task.project}</span>
                            )}
                            {task.date !== selectedDate && (
                              <span className="task-tag icon-label">
                                <Icon name="date" /> {task.date}
                              </span>
                            )}
                            {task.dueTime && (
                              <small className="icon-label">
                                <Icon name="clock" /> {task.dueTime}
                              </small>
                            )}
                            <button
                              className="mini-action"
                              title="Перенести в задачи без даты"
                              aria-label={`Убрать задачу ${task.title} из дня`}
                              onClick={() => moveTaskToAnyDay(task)}
                            >
                              <Icon name="arrow-left" />
                            </button>
                            <button
                              className="mini-action"
                              title="Редактировать"
                              aria-label={`Редактировать задачу ${task.title}`}
                              onClick={() => editTaskRow(task)}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              className="mini-action danger-text"
                              title="Удалить"
                              aria-label={`Удалить задачу ${task.title}`}
                              onClick={() => deleteTask(task)}
                            >
                              <Icon name="delete" />
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
                            <Icon name="stop" />
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
                                <Icon name="save" />
                              </button>
                              <button
                                type="button"
                                title="Отмена"
                                aria-label="Отменить редактирование времени"
                                onClick={() => setEditingEntryId(null)}
                              >
                                <Icon name="close" />
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
                                <Icon name="edit" />
                              </button>
                              <button
                                className="mini-action danger-text"
                                title="Удалить"
                                aria-label={`Удалить запись ${entry.title}`}
                                onClick={() => deleteEntry(entry)}
                              >
                                <Icon name="delete" />
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </section>
                  <section className="panel calendar-unscheduled-panel">
                    <div className="section-heading">
                      <h2>На любой день</h2>
                      <button
                        className="board-add-button"
                        aria-label="Добавить задачу без даты"
                        title="Добавить задачу без даты"
                        onClick={() =>
                          setIsAddingUnscheduledTask((isAdding) => !isAdding)
                        }
                      >
                        <Icon name="plus" />
                      </button>
                      <strong>{unscheduledTasks.length}</strong>
                    </div>
                    {isAddingUnscheduledTask && unscheduledTaskForm}
                    {unscheduledTasks.length === 0 &&
                    !isAddingUnscheduledTask ? (
                      <p className="empty-state">Задач без даты нет.</p>
                    ) : (
                      unscheduledTasks.map((task) =>
                        taskRowDraft?.id === task.id ? (
                          taskRowEditor
                        ) : (
                          <div
                            className={`hub-day-row ${task.status === "done" ? "is-done" : ""}`}
                            key={task.id}
                          >
                            <button
                              className="mini-action"
                              title="Перенести на выбранный день"
                              aria-label={`Перенести задачу ${task.title} на ${formatDate(selectedDate)}`}
                              onClick={() => moveTaskToSelectedDay(task)}
                            >
                              <Icon name="arrow-right" />
                            </button>
                            <span className="hub-row-title">{task.title}</span>
                            {task.project && (
                              <span className="task-tag">{task.project}</span>
                            )}
                            {task.status !== "todo" && (
                              <span className="task-tag">
                                {task.status === "done" ? "Готово" : "В работе"}
                              </span>
                            )}
                            <button
                              className="mini-action"
                              title="Редактировать"
                              aria-label={`Редактировать задачу ${task.title}`}
                              onClick={() => editTaskRow(task)}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              className="mini-action danger-text"
                              title="Удалить"
                              aria-label={`Удалить задачу ${task.title}`}
                              onClick={() => deleteTask(task)}
                            >
                              <Icon name="delete" />
                            </button>
                          </div>
                        ),
                      )
                    )}
                  </section>
                </div>
              </div>
            )}

            {view === "statistics" && (
              <>
                {periodTabs}
                <div className="statistics-page">
                  <section
                    className="panel statistics-period-panel"
                    aria-label="Показатели за период"
                  >
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
              </>
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
                  </div>
                  <textarea
                    className="report-markdown"
                    aria-label="Отчёт в формате Markdown"
                    value={reportMarkdown}
                    readOnly
                    spellCheck={false}
                  />
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

interface BoardGridProps {
  boards: Board[];
  activeBoardId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onMove: (sourceId: string, targetId: string) => void;
  onReorder: (boardIds: string[]) => void;
}

function BoardGrid({
  boards,
  activeBoardId,
  onClose,
  onSelect,
  onMove,
  onReorder,
}: BoardGridProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const previewOrderRef = useRef<string[] | null>(null);
  const previousRects = useRef<Map<string, DOMRect> | null>(null);
  const cardElements = useRef(new Map<string, HTMLButtonElement>());
  const listElement = useRef<HTMLDivElement>(null);
  const suppressSelection = useRef(false);
  const boardsById = new Map(boards.map((board) => [board.id, board]));
  const displayedBoards = previewOrder
    ? previewOrder.map((id) => boardsById.get(id)!).filter(Boolean)
    : boards;

  useLayoutEffect(() => {
    const before = previousRects.current;
    previousRects.current = null;
    if (!before || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    cardElements.current.forEach((element, id) => {
      if (id === draggedId) return;
      const oldRect = before.get(id);
      if (!oldRect) return;
      const newRect = element.getBoundingClientRect();
      const offsetX = oldRect.left - newRect.left;
      const offsetY = oldRect.top - newRect.top;
      if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) return;
      element.animate(
        [
          { transform: `translate(${offsetX}px, ${offsetY}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 240, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" },
      );
    });
  }, [previewOrder, draggedId]);

  function previewMove(targetId: string, pointerX: number, pointerY: number) {
    const ids = previewOrderRef.current;
    if (!draggedId || !ids || draggedId === targetId) return;
    const list = listElement.current;
    const target = cardElements.current.get(targetId);
    if (!list || !target) return;

    const listRect = list.getBoundingClientRect();
    const targetLeft = listRect.left + target.offsetLeft - list.scrollLeft;
    const targetTop = listRect.top + target.offsetTop - list.scrollTop;
    if (
      pointerX < targetLeft ||
      pointerX > targetLeft + target.offsetWidth ||
      pointerY < targetTop ||
      pointerY > targetTop + target.offsetHeight
    ) {
      return;
    }

    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    previousRects.current = new Map(
      [...cardElements.current].map(([id, element]) => [
        id,
        element.getBoundingClientRect(),
      ]),
    );
    const nextIds = [...ids];
    nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, draggedId);
    previewOrderRef.current = nextIds;
    setPreviewOrder(nextIds);
  }

  function finishDrag() {
    setDraggedId(null);
    setPreviewOrder(null);
    previewOrderRef.current = null;
    previousRects.current = null;
    suppressSelection.current = true;
    window.setTimeout(() => {
      suppressSelection.current = false;
    }, 0);
  }

  return (
    <>
      <div
        ref={listElement}
        className="board-grid-list"
        aria-label="Порядок досок"
      >
        {displayedBoards.map((board, index) => (
          <button
            key={board.id}
            ref={(element) => {
              if (element) cardElements.current.set(board.id, element);
              else cardElements.current.delete(board.id);
            }}
            type="button"
            className={[
              "board-grid-card",
              board.id === activeBoardId && "board-grid-card--active",
              board.id === draggedId && "board-grid-card--dragged",
            ].filter(Boolean).join(" ")}
            draggable
            aria-label={`${board.name}, позиция ${index + 1} из ${boards.length}. Открыть доску или переместить стрелками.`}
            onClick={() => {
              if (!suppressSelection.current) onSelect(board.id);
            }}
            onKeyDown={(event) => {
              const offset =
                event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : 0;
              if (!offset || !boards[index + offset]) return;
              event.preventDefault();
              onMove(board.id, boards[index + offset].id);
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", board.id);
              const ids = boards.map((item) => item.id);
              previewOrderRef.current = ids;
              setPreviewOrder(ids);
              setDraggedId(board.id);
            }}
            onDragEnter={(event) => {
              previewMove(board.id, event.clientX, event.clientY);
            }}
            onDragOver={(event) => {
              if (draggedId) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const ids = previewOrderRef.current;
              if (ids && ids.some((id, position) => id !== boards[position].id)) {
                onReorder(ids);
              }
              finishDrag();
            }}
            onDragEnd={finishDrag}
          >
            <span className="board-grid-card-top">
              <span className="board-grid-card-number">
                {String(index + 1).padStart(2, "0")}
              </span>
            </span>
            <span className="board-grid-card-silhouette" aria-hidden="true">
              <span />
            </span>
            <span className="board-grid-card-name">{board.name}</span>
            {board.id === activeBoardId && (
              <span className="board-grid-card-current">Текущая</span>
            )}
          </button>
        ))}
      </div>
      <button className="board-grid-back" type="button" onClick={onClose}>
        <Icon name="arrow-left" />
        Вернуться к доске
      </button>
    </>
  );
}

interface BoardTransition {
  fromId: string;
  toId: string;
  direction: CarouselDirection;
  moving: boolean;
}

function App() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [transition, setTransition] = useState<BoardTransition | null>(null);
  const [gridPhase, setGridPhase] = useState<
    "closed" | "opening" | "open" | "closing"
  >("closed");

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    root?.classList.toggle("board-grid-background-visible", gridPhase === "open");

    return () => root?.classList.remove("board-grid-background-visible");
  }, [gridPhase]);

  const [boardError, setBoardError] = useState("");
  const [shiftPressed, setShiftPressed] = useState(false);
  const navigating = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      setShiftPressed(event.key === "Shift" || event.shiftKey);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      setShiftPressed(event.key === "Shift" ? false : event.shiftKey);
    };
    const onPointerMove = (event: PointerEvent) => {
      setShiftPressed(event.shiftKey);
    };
    const onBlur = () => setShiftPressed(false);

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([database.boards(), database.selectedBoardId()])
      .then(([storedBoards, selectedId]) => {
        if (cancelled) return;
        setBoards(storedBoards);
        const selectedBoard = storedBoards.find(
          (board) => board.id === selectedId,
        );
        setActiveBoardId(selectedBoard?.id ?? storedBoards[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled)
          setBoardError("Не удалось загрузить доски из IndexedDB.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!transition || transition.moving) return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setTransition((current) =>
          current ? { ...current, moving: true } : null,
        );
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [transition]);

  useEffect(() => {
    if (!transition?.moving) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      () => {
        setActiveBoardId(transition.toId);
        setTransition(null);
        navigating.current = false;
      },
      reducedMotion ? 0 : 920,
    );

    return () => window.clearTimeout(timeout);
  }, [transition]);

  useEffect(() => {
    if (gridPhase !== "opening") return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setGridPhase("open"));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [gridPhase]);

  useEffect(() => {
    if (gridPhase !== "closing") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(() => {
      setGridPhase("closed");
      navigating.current = false;
    }, reducedMotion ? 0 : 920);
    return () => window.clearTimeout(timeout);
  }, [gridPhase]);

  useEffect(() => {
    if (gridPhase !== "open") return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBoardGrid();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [gridPhase]);

  function openBoardGrid() {
    if (navigating.current || gridPhase !== "closed") return;
    navigating.current = true;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setGridPhase("opening");
  }

  function closeBoardGrid() {
    if (gridPhase !== "open") return;
    setGridPhase("closing");
  }

  async function selectBoardFromGrid(id: string) {
    if (gridPhase !== "open") return;
    if (id === activeBoardId) {
      closeBoardGrid();
      return;
    }
    try {
      await database.saveSelectedBoardId(id);
      setActiveBoardId(id);
      setBoardError("");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setGridPhase("closing"));
      });
    } catch {
      setBoardError("Не удалось открыть доску.");
    }
  }

  async function reorderBoardsInGrid(orderedIds: string[]) {
    const boardsById = new Map(boards.map((board) => [board.id, board]));
    setBoards(orderedIds.map((id, position) => ({
      ...boardsById.get(id)!,
      position,
    })));
    try {
      await database.reorderBoards(orderedIds);
      setBoardError("");
    } catch {
      void database.boards().then(setBoards).catch(() => {});
      setBoardError("Не удалось изменить порядок досок.");
    }
  }

  function moveBoardInGrid(sourceId: string, targetId: string) {
    const fromIndex = boards.findIndex((board) => board.id === sourceId);
    const toIndex = boards.findIndex((board) => board.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const orderedIds = boards.map((board) => board.id);
    orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, sourceId);
    void reorderBoardsInGrid(orderedIds);
  }

  async function renameBoard(id: string, name: string): Promise<boolean> {
    const board = boards.find((item) => item.id === id);
    if (!board) return false;

    try {
      const updated = { ...board, name };
      await database.saveBoard(updated);
      setBoards((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
      setBoardError("");
      return true;
    } catch {
      setBoardError("Не удалось сохранить название доски.");
      return false;
    }
  }

  async function selectBoard(
    targetId: string,
    direction: CarouselDirection,
  ): Promise<void> {
    if (navigating.current || !activeBoardId || targetId === activeBoardId) {
      return;
    }

    navigating.current = true;
    try {
      await database.saveSelectedBoardId(targetId);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setBoardError("");
      setTransition({
        fromId: activeBoardId,
        toId: targetId,
        direction,
        moving: false,
      });
    } catch {
      navigating.current = false;
      setBoardError("Не удалось перейти на другую доску.");
    }
  }

  async function createBoard(direction: CarouselDirection): Promise<void> {
    if (navigating.current || !activeBoardId) return;

    navigating.current = true;
    const currentIndex = boards.findIndex(
      (board) => board.id === activeBoardId,
    );
    const insertIndex = currentIndex + (direction === 1 ? 1 : 0);
    let number = boards.length + 1;
    while (boards.some((board) => board.name === `Доска ${number}`)) {
      number += 1;
    }

    const board: Board = {
      id: crypto.randomUUID(),
      name: `Доска ${number}`,
      position: insertIndex,
    };

    try {
      const updatedBoards = await database.insertBoard(board, insertIndex);
      setBoards(updatedBoards);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setBoardError("");
      setTransition({
        fromId: activeBoardId,
        toId: board.id,
        direction,
        moving: false,
      });
    } catch {
      navigating.current = false;
      setBoardError("Не удалось создать доску.");
      void database
        .boards()
        .then(setBoards)
        .catch(() => {});
    }
  }

  function useEdge(direction: CarouselDirection, shiftKey: boolean) {
    if (!activeBoardId) return;
    const action = edgeAction(boards, activeBoardId, direction, shiftKey);
    if (action.kind === "create") {
      void createBoard(direction);
      return;
    }

    void selectBoard(action.targetId, direction);
  }

  async function removeBoard(id: string): Promise<boolean> {
    if (navigating.current || id !== activeBoardId) return false;

    navigating.current = true;
    const currentIndex = boards.findIndex((board) => board.id === id);
    const neighbor = boards[currentIndex - 1] ?? boards[currentIndex + 1];
    const replacement: Board | undefined = neighbor
      ? undefined
      : {
          id: crypto.randomUUID(),
          name: "Моя доска",
          position: 0,
        };
    const nextBoardId = neighbor?.id ?? replacement!.id;

    try {
      await database.deleteBoard(id, nextBoardId, replacement);
      setBoards((current) => [
        ...current.filter((board) => board.id !== id),
        ...(replacement ? [replacement] : []),
      ]);
      setActiveBoardId(nextBoardId);
      setBoardError("");
      return true;
    } catch {
      setBoardError("Не удалось полностью удалить доску.");
      try {
        const [storedBoards, selectedId] = await Promise.all([
          database.boards(),
          database.selectedBoardId(),
        ]);
        setBoards(storedBoards);
        if (!storedBoards.some((board) => board.id === id)) {
          const selectedBoard = storedBoards.find(
            (board) => board.id === selectedId,
          );
          setActiveBoardId(selectedBoard?.id ?? storedBoards[0]?.id ?? null);
        }
      } catch {
        setBoardError("Не удалось загрузить список досок после удаления.");
      }
      return false;
    } finally {
      navigating.current = false;
    }
  }

  const activeBoard = boards.find((board) => board.id === activeBoardId);
  if (!activeBoard) {
    return (
      <div className="board-startup" role={boardError ? "alert" : "status"}>
        {boardError || "Загрузка доски…"}
      </div>
    );
  }

  const visibleBoards = transition
    ? [
        boards.find((board) => board.id === transition.fromId),
        boards.find((board) => board.id === transition.toId),
      ].filter((board): board is Board => board !== undefined)
    : [activeBoard];

  return (
    <>
      <div
        className={`window-view-background${gridPhase === "opening" || gridPhase === "open" ? " window-view-background--visible" : ""}`}
        aria-hidden="true"
      />
      <div className="board-carousel-stage">
        {visibleBoards.map((board) => {
          let motionClass = "";
          if (transition?.fromId === board.id && transition.moving) {
            motionClass =
              transition.direction === 1
                ? "board-slide--left"
                : "board-slide--right";
          }
          if (transition?.toId === board.id && !transition.moving) {
            motionClass =
              transition.direction === 1
                ? "board-slide--right"
                : "board-slide--left";
          }
          if (gridPhase === "open") {
            motionClass = "board-slide--grid-hidden";
          }

          return (
            <div
              key={board.id}
              className={`board-slide ${motionClass}`}
              inert={transition !== null || gridPhase !== "closed"}
            >
              <BoardContent
                board={board}
                onRenameBoard={renameBoard}
                onDeleteBoard={removeBoard}
                onOpenBoardGrid={openBoardGrid}
              />
            </div>
          );
        })}
        {gridPhase !== "closed" && (
          <div
            className={`board-grid-screen${gridPhase === "open" ? " board-grid-screen--visible" : ""}`}
            inert={gridPhase !== "open"}
          >
            <BoardGrid
              boards={boards}
              activeBoardId={activeBoard.id}
              onClose={closeBoardGrid}
              onSelect={(id) => void selectBoardFromGrid(id)}
              onMove={(sourceId, targetId) => {
                moveBoardInGrid(sourceId, targetId);
              }}
              onReorder={(ids) => void reorderBoardsInGrid(ids)}
            />
          </div>
        )}
      </div>

      {gridPhase === "closed" && ([-1, 1] as const).map((direction) => {
        const isLeft = direction === -1;
        const action = edgeAction(
          boards,
          activeBoard.id,
          direction,
          shiftPressed,
        );
        const label =
          action.kind === "create"
            ? isLeft
              ? "Добавить доску слева"
              : "Добавить доску справа"
            : isLeft
              ? "Предыдущая доска"
              : "Следующая доска";
        return (
          <button
            key={direction}
            type="button"
            className={`board-edge-button ${isLeft ? "board-edge-button--left" : "board-edge-button--right"}`}
            aria-label={label}
            title={`${label} — Shift меняет действие`}
            disabled={transition !== null}
            onPointerDown={(event) => setShiftPressed(event.shiftKey)}
            onClick={(event) => useEdge(direction, event.shiftKey)}
          >
            <span className="board-edge-button-face" aria-hidden="true">
              <Icon
                name={
                  action.kind === "create"
                    ? "plus"
                    : isLeft
                      ? "chevron-left"
                      : "chevron-right"
                }
              />
            </span>
          </button>
        );
      })}

      {boardError && (
        <div className="board-error" role="alert">
          {boardError}
        </div>
      )}
    </>
  );
}

export default App;
