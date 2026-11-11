export interface Task {
  id: string;
  title: string;
  project: string;
  note: string;
  date: string;
  dueTime: string;
  estimateMinutes: number;
  status: "todo" | "doing" | "done";
  createdAt: string;
  completedAt: string | null;
}

export interface TimeEntry {
  id: string;
  taskId: string | null;
  title: string;
  date: string;
  minutes: number;
  startTime?: string;
  endTime?: string;
  createdAt: string;
}

export interface ActiveTimer {
  id: "activeTimer";
  taskId: string | null;
  title: string;
  startedAt: string;
}

export type ReportPeriod = "day" | "week" | "month" | "year";
