import type { Task } from "../data/model";

export function scheduleTask(task: Task, date: string): Task {
  return {
    ...task,
    date,
  };
}

export function unscheduleTask(task: Task): Task {
  return {
    ...task,
    date: null,
    dueTime: "",
  };
}
