import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  addDays,
  dateKey,
  dateKeyFromTimestamp,
  formatDate,
  minutesBetweenTimes,
  mondayOf,
  parseDate,
} from "../lib/dates";
import { database } from "../data/database";
import type {
  ActiveTimer,
  Board,
  ReportPeriod,
  Task,
  TimeEntry,
} from "../data/model";
import { scheduleTask, unscheduleTask } from "../lib/taskSchedule";
import { entriesFromTimer } from "../lib/timer";
import { hasEditableClockTimes } from "../lib/timeEntries";
import { buildReportSummary, reportTitle } from "../reports/reportSummary";
import ReportPage from "../reports/ReportPage";
import BoardSidebar from "./BoardSidebar";
import DateHeader from "../views/DateHeader";
import {
  QuickTaskForm,
  TaskRowEditor,
  UnscheduledTaskForm,
} from "../forms/TaskForms";
import type { TaskRowDraft, View } from "./types";
import TasksView from "../views/TasksView";
import CalendarView from "../views/CalendarView";

interface BoardContentProps {
  board: Board;
  onRenameBoard: (id: string, name: string) => Promise<boolean>;
  onDeleteBoard: (id: string) => Promise<boolean>;
  onOpenBoardGrid: () => void;
}

export default function BoardContent({
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

  const reportSummary = buildReportSummary(
    reportPeriod,
    selectedDate,
    tasks,
    entries,
  );
  const headerDate =
    view === "tasks" || view === "calendar" || reportPeriod === "day"
      ? formatDate(selectedDate, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : reportTitle(reportPeriod, reportSummary.start, reportSummary.end);
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
    <QuickTaskForm
      view={view}
      quickTaskTitle={quickTaskTitle}
      setQuickTaskTitle={setQuickTaskTitle}
      quickTaskProject={quickTaskProject}
      setQuickTaskProject={setQuickTaskProject}
      quickTaskDueTime={quickTaskDueTime}
      setQuickTaskDueTime={setQuickTaskDueTime}
      showQuickTimeFields={showQuickTimeFields}
      setShowQuickTimeFields={setShowQuickTimeFields}
      quickTimeStart={quickTimeStart}
      setQuickTimeStart={setQuickTimeStart}
      quickTimeEnd={quickTimeEnd}
      setQuickTimeEnd={setQuickTimeEnd}
      addTaskForSelectedDay={addTaskForSelectedDay}
      setIsAddingDayTask={setIsAddingDayTask}
    />
  );

  const unscheduledTaskForm = (
    <UnscheduledTaskForm
      unscheduledTaskTitle={unscheduledTaskTitle}
      setUnscheduledTaskTitle={setUnscheduledTaskTitle}
      unscheduledTaskProject={unscheduledTaskProject}
      setUnscheduledTaskProject={setUnscheduledTaskProject}
      addUnscheduledTask={addUnscheduledTask}
      setIsAddingUnscheduledTask={setIsAddingUnscheduledTask}
    />
  );

  const taskRowEditor = taskRowDraft && (
    <TaskRowEditor
      key={taskRowDraft.id}
      view={view}
      taskRowDraft={taskRowDraft}
      setTaskRowDraft={setTaskRowDraft}
      saveTaskRowEdit={saveTaskRowEdit}
    />
  );

  return (
    <div className="app-shell">
      <BoardSidebar
        board={board}
        boardNameInput={boardNameInput}
        boardNameDraft={boardNameDraft}
        setBoardNameDraft={setBoardNameDraft}
        editingBoardName={editingBoardName}
        setEditingBoardName={setEditingBoardName}
        saveBoardName={saveBoardName}
        view={view}
        setView={setView}
        confirmingBoardDelete={confirmingBoardDelete}
        setConfirmingBoardDelete={setConfirmingBoardDelete}
        onDeleteBoard={onDeleteBoard}
        onOpenBoardGrid={onOpenBoardGrid}
      />

      <main className="main-content">
        <DateHeader
          view={view}
          headerDate={headerDate}
          ready={ready}
          reportPeriod={reportPeriod}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          moveSelectedDate={moveSelectedDate}
        />

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
              <TasksView
                dayTasks={dayTasks}
                isAddingDayTask={isAddingDayTask}
                quickTaskForm={quickTaskForm}
                taskRowDraft={taskRowDraft}
                taskRowEditor={taskRowEditor}
                setQuickTaskProject={setQuickTaskProject}
                setIsAddingDayTask={setIsAddingDayTask}
                setTaskStatus={setTaskStatus}
                editTaskRow={editTaskRow}
                deleteTask={deleteTask}
              />
            )}

            {view === "calendar" && (
              <CalendarView
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                month={month}
                currentDay={currentDay}
                calendarDays={calendarDays}
                tasks={tasks}
                entries={entries}
                calendarCompletedCount={calendarCompletedCount}
                calendarDayTasks={calendarDayTasks}
                dayMinutes={dayMinutes}
                dayEntries={dayEntries}
                timer={timer}
                now={now}
                isAddingDayTask={isAddingDayTask}
                setQuickTaskProject={setQuickTaskProject}
                setIsAddingDayTask={setIsAddingDayTask}
                quickTaskForm={quickTaskForm}
                taskRowDraft={taskRowDraft}
                taskRowEditor={taskRowEditor}
                isAddingUnscheduledTask={isAddingUnscheduledTask}
                setIsAddingUnscheduledTask={setIsAddingUnscheduledTask}
                unscheduledTaskForm={unscheduledTaskForm}
                unscheduledTasks={unscheduledTasks}
                moveMonth={moveMonth}
                setTaskStatus={setTaskStatus}
                moveTaskToAnyDay={moveTaskToAnyDay}
                editTaskRow={editTaskRow}
                deleteTask={deleteTask}
                stopTimer={stopTimer}
                editingEntryId={editingEntryId}
                entryTitle={entryTitle}
                setEntryTitle={setEntryTitle}
                entryStart={entryStart}
                setEntryStart={setEntryStart}
                entryEnd={entryEnd}
                setEntryEnd={setEntryEnd}
                entryMinutes={entryMinutes}
                setEntryMinutes={setEntryMinutes}
                saveEntryEdit={saveEntryEdit}
                setEditingEntryId={setEditingEntryId}
                editEntry={editEntry}
                deleteEntry={deleteEntry}
                moveTaskToSelectedDay={moveTaskToSelectedDay}
              />
            )}

            {(view === "statistics" || view === "reports") && (
              <ReportPage
                view={view}
                period={reportPeriod}
                setPeriod={setReportPeriod}
                summary={reportSummary}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
