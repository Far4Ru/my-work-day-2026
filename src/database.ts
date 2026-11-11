import type { ActiveTimer, Task, TimeEntry } from "./model";

const DATABASE_NAME = "todo-did";
const DATABASE_VERSION = 1;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Ошибка IndexedDB"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("tasks")) {
        database.createObjectStore("tasks", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("timeEntries")) {
        database.createObjectStore("timeEntries", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Не удалось открыть IndexedDB"));
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  try {
    return await requestResult<T[]>(
      database.transaction(storeName).objectStore(storeName).getAll(),
    );
  } finally {
    database.close();
  }
}

async function write(
  storeName: string,
  value: Task | TimeEntry | ActiveTimer,
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Не удалось сохранить запись"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Сохранение прервано"));
    });
  } finally {
    database.close();
  }
}

async function remove(storeName: string, id: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Не удалось удалить запись"));
    });
  } finally {
    database.close();
  }
}

export const database = {
  tasks: () => readAll<Task>("tasks"),
  entries: () => readAll<TimeEntry>("timeEntries"),
  saveTask: (task: Task) => write("tasks", task),
  saveEntry: (entry: TimeEntry) => write("timeEntries", entry),
  deleteTask: (id: string) => remove("tasks", id),
  deleteEntry: (id: string) => remove("timeEntries", id),
  activeTimer: async () => {
    const database = await openDatabase();
    try {
      return await requestResult<ActiveTimer | undefined>(
        database
          .transaction("settings")
          .objectStore("settings")
          .get("activeTimer"),
      );
    } finally {
      database.close();
    }
  },
  saveTimer: (timer: ActiveTimer) => write("settings", timer),
  finishTimer: async (entries: TimeEntry[]) => {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ["timeEntries", "settings"],
          "readwrite",
        );
        const entryStore = transaction.objectStore("timeEntries");
        entries.forEach((entry) => entryStore.put(entry));
        transaction.objectStore("settings").delete("activeTimer");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Не удалось завершить таймер"));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Завершение таймера прервано"));
      });
    } finally {
      database.close();
    }
  },
};
