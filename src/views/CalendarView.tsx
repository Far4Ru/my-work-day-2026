import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import type { ActiveTimer, Task, TimeEntry } from "../data/model";
import {
  dateKeyFromTimestamp,
  formatDate,
  minutesLabel,
  parseDate,
} from "../lib/dates";
import Icon from "../ui/Icon";
import CalendarTimeEntries from "./CalendarTimeEntries";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

interface CalendarViewProps {
  selectedDate: string;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  month: number;
  currentDay: string;
  calendarDays: string[];
  tasks: Task[];
  entries: TimeEntry[];
  calendarCompletedCount: number;
  calendarDayTasks: Task[];
  dayMinutes: number;
  dayEntries: TimeEntry[];
  timer: ActiveTimer | null;
  now: number;
  isAddingDayTask: boolean;
  setQuickTaskProject: Dispatch<SetStateAction<string>>;
  setIsAddingDayTask: Dispatch<SetStateAction<boolean>>;
  quickTaskForm: ReactNode;
  taskRowDraft: { id: string } | null;
  taskRowEditor: ReactNode;
  isAddingUnscheduledTask: boolean;
  setIsAddingUnscheduledTask: Dispatch<SetStateAction<boolean>>;
  unscheduledTaskForm: ReactNode;
  unscheduledTasks: Task[];
  moveMonth: (amount: number) => void;
  setTaskStatus: (task: Task, status: Task["status"]) => void;
  moveTaskToAnyDay: (task: Task) => void;
  editTaskRow: (task: Task) => void;
  deleteTask: (task: Task) => void;
  stopTimer: () => void;
  editingEntryId: string | null;
  entryTitle: string;
  setEntryTitle: Dispatch<SetStateAction<string>>;
  entryStart: string;
  setEntryStart: Dispatch<SetStateAction<string>>;
  entryEnd: string;
  setEntryEnd: Dispatch<SetStateAction<string>>;
  entryMinutes: string;
  setEntryMinutes: Dispatch<SetStateAction<string>>;
  saveEntryEdit: (event: FormEvent<HTMLFormElement>) => void;
  setEditingEntryId: Dispatch<SetStateAction<string | null>>;
  editEntry: (entry: TimeEntry) => void;
  deleteEntry: (entry: TimeEntry) => void;
  moveTaskToSelectedDay: (task: Task) => void;
}

export default function CalendarView({
  selectedDate,
  setSelectedDate,
  month,
  currentDay,
  calendarDays,
  tasks,
  entries,
  calendarCompletedCount,
  calendarDayTasks,
  dayMinutes,
  dayEntries,
  timer,
  now,
  isAddingDayTask,
  setQuickTaskProject,
  setIsAddingDayTask,
  quickTaskForm,
  taskRowDraft,
  taskRowEditor,
  isAddingUnscheduledTask,
  setIsAddingUnscheduledTask,
  unscheduledTaskForm,
  unscheduledTasks,
  moveMonth,
  setTaskStatus,
  moveTaskToAnyDay,
  editTaskRow,
  deleteTask,
  stopTimer,
  editingEntryId,
  entryTitle,
  setEntryTitle,
  entryStart,
  setEntryStart,
  entryEnd,
  setEntryEnd,
  entryMinutes,
  setEntryMinutes,
  saveEntryEdit,
  setEditingEntryId,
  editEntry,
  deleteEntry,
  moveTaskToSelectedDay,
}: CalendarViewProps) {
  return (
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
              <button aria-label="Следующий месяц" onClick={() => moveMonth(1)}>
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
              {calendarCompletedCount} из {calendarDayTasks.length} готово
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
                    <Icon name={task.status === "done" ? "restore" : "check"} />
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
          <CalendarTimeEntries
            timer={timer}
            selectedDate={selectedDate}
            now={now}
            stopTimer={stopTimer}
            dayEntries={dayEntries}
            dayMinutes={dayMinutes}
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
          />
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
          {unscheduledTasks.length === 0 && !isAddingUnscheduledTask ? (
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
  );
}
