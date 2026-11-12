import { dateKey } from "../lib/dates.ts";
import type { Board, Task } from "./model";

export const sampleBoards: Board[] = [
  { id: "main", name: "Личный день", position: 0 },
  { id: "work", name: "Работа и проекты", position: 1 },
  { id: "learning", name: "Учёба и идеи", position: 2 },
];

export const sampleSelectedBoardId = sampleBoards[1].id;

interface SampleTask {
  title: string;
  project: string;
  note: string;
  status: Task["status"];
  scheduled?: boolean;
}

const tasksByBoard: Record<string, SampleTask[]> = {
  main: [
    {
      title: "Добавьте свою первую задачу кнопкой +",
      project: "Мои планы",
      note: "Кнопка находится в колонке «Сделать».",
      status: "todo",
    },
    {
      title: "Перемещайте задачи стрелками между колонками",
      project: "Мои планы",
      note: "Стрелка в строке задачи меняет её статус.",
      status: "doing",
    },
    {
      title: "Отмечайте завершённые задачи галочкой",
      project: "Привычки",
      note: "Готовые дела попадут в статистику и отчёты.",
      status: "done",
    },
  ],
  work: [
    {
      title: "Наведите на название доски, чтобы изменить его",
      project: "Проект",
      note: "Кнопки редактирования появятся рядом с названием слева.",
      status: "todo",
    },
    {
      title: "Откройте «Все доски» через логотип слева",
      project: "Навигация",
      note: "В сетке можно перетащить доски и изменить их порядок.",
      status: "doing",
    },
    {
      title: "Переключите доску боковой стрелкой",
      project: "Навигация",
      note: "Кнопки на краях экрана ведут к соседним доскам.",
      status: "todo",
    },
    {
      title: "Посмотрите календарь, статистику и отчёты",
      project: "Проект",
      note: "Разделы переключаются в боковой панели.",
      status: "done",
    },
  ],
  learning: [
    {
      title: "Укажите проект и время при создании задачи",
      project: "Обучение",
      note: "Дополнительные поля доступны в форме задачи.",
      status: "todo",
    },
    {
      title: "Запустите таймер через значок часов",
      project: "Практика",
      note: "Учёт времени связан с выбранной задачей.",
      status: "doing",
    },
    {
      title: "Перенесите эту задачу на нужный день",
      project: "Идеи",
      note: "Она находится в календарной панели «На любой день».",
      status: "todo",
      scheduled: false,
    },
  ],
};

export function sampleTasks(boardId: string, now = new Date()): Task[] {
  const today = dateKey(now);
  const timestamp = now.toISOString();

  return (tasksByBoard[boardId] ?? []).map((task, index) => ({
    id: `sample-${boardId}-${index}`,
    title: task.title,
    project: task.project,
    note: task.note,
    date: task.scheduled === false ? null : today,
    dueTime: "",
    estimateMinutes: 0,
    status: task.status,
    createdAt: new Date(now.getTime() + index).toISOString(),
    completedAt: task.status === "done" ? timestamp : null,
  }));
}
