import type { Task } from "../data/model";

export type View = "tasks" | "calendar" | "statistics" | "reports";
export type TaskRowDraft = Pick<
  Task,
  "id" | "title" | "project" | "date" | "dueTime" | "note"
> & {
  estimateMinutes: string;
  showTimeFields: boolean;
  timeStart: string;
  timeEnd: string;
};
