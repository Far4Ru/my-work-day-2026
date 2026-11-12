import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Task } from "../data/model";
import { minutesLabel } from "../lib/dates";
import Icon from "../ui/Icon";

interface TasksViewProps {
  dayTasks: Task[];
  isAddingDayTask: boolean;
  quickTaskForm: ReactNode;
  taskRowDraft: { id: string } | null;
  taskRowEditor: ReactNode;
  setQuickTaskProject: Dispatch<SetStateAction<string>>;
  setIsAddingDayTask: Dispatch<SetStateAction<boolean>>;
  setTaskStatus: (task: Task, status: Task["status"]) => void;
  editTaskRow: (task: Task) => void;
  deleteTask: (task: Task) => void;
}

export default function TasksView({
  dayTasks,
  isAddingDayTask,
  quickTaskForm,
  taskRowDraft,
  taskRowEditor,
  setQuickTaskProject,
  setIsAddingDayTask,
  setTaskStatus,
  editTaskRow,
  deleteTask,
}: TasksViewProps) {
  return (
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
                {dayTasks.filter((task) => task.status === status).length}
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
                            task.status === "doing" ? "todo" : "doing",
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
                          <small className="task-list-note">{task.note}</small>
                        )}
                      </span>
                      {task.project && (
                        <span className="task-tag">{task.project}</span>
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
  );
}
