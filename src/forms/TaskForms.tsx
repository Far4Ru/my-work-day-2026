import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { TaskRowDraft, View } from "../boards/types";
import Icon from "../ui/Icon";

interface QuickTaskFormProps {
  view: View;
  quickTaskTitle: string;
  setQuickTaskTitle: Dispatch<SetStateAction<string>>;
  quickTaskProject: string;
  setQuickTaskProject: Dispatch<SetStateAction<string>>;
  quickTaskDueTime: string;
  setQuickTaskDueTime: Dispatch<SetStateAction<string>>;
  showQuickTimeFields: boolean;
  setShowQuickTimeFields: Dispatch<SetStateAction<boolean>>;
  quickTimeStart: string;
  setQuickTimeStart: Dispatch<SetStateAction<string>>;
  quickTimeEnd: string;
  setQuickTimeEnd: Dispatch<SetStateAction<string>>;
  addTaskForSelectedDay: (event: FormEvent<HTMLFormElement>) => void;
  setIsAddingDayTask: Dispatch<SetStateAction<boolean>>;
}

export function QuickTaskForm({
  view,
  quickTaskTitle,
  setQuickTaskTitle,
  quickTaskProject,
  setQuickTaskProject,
  quickTaskDueTime,
  setQuickTaskDueTime,
  showQuickTimeFields,
  setShowQuickTimeFields,
  quickTimeStart,
  setQuickTimeStart,
  quickTimeEnd,
  setQuickTimeEnd,
  addTaskForSelectedDay,
  setIsAddingDayTask,
}: QuickTaskFormProps) {
  return (
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
}

interface UnscheduledTaskFormProps {
  unscheduledTaskTitle: string;
  setUnscheduledTaskTitle: Dispatch<SetStateAction<string>>;
  unscheduledTaskProject: string;
  setUnscheduledTaskProject: Dispatch<SetStateAction<string>>;
  addUnscheduledTask: (event: FormEvent<HTMLFormElement>) => void;
  setIsAddingUnscheduledTask: Dispatch<SetStateAction<boolean>>;
}

export function UnscheduledTaskForm({
  unscheduledTaskTitle,
  setUnscheduledTaskTitle,
  unscheduledTaskProject,
  setUnscheduledTaskProject,
  addUnscheduledTask,
  setIsAddingUnscheduledTask,
}: UnscheduledTaskFormProps) {
  return (
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
}

interface TaskRowEditorProps {
  view: View;
  taskRowDraft: TaskRowDraft;
  setTaskRowDraft: Dispatch<SetStateAction<TaskRowDraft | null>>;
  saveTaskRowEdit: (event: FormEvent<HTMLFormElement>) => void;
}

export function TaskRowEditor({
  view,
  taskRowDraft,
  setTaskRowDraft,
  saveTaskRowEdit,
}: TaskRowEditorProps) {
  return (
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
}
