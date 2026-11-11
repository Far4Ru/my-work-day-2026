import type { ActiveTimer, Board, Task, TimeEntry } from "./model";

const DEFAULT_BOARD_ID = "main";
const DATA_DATABASE_NAME = "todo-did";
const REGISTRY_DATABASE_NAME = "todo-did-boards";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Ошибка IndexedDB"));
  });
}

function transactionDone(
  transaction: IDBTransaction,
  errorMessage: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error(errorMessage));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error(errorMessage));
  });
}

function openBoardData(boardId: string): Promise<IDBDatabase> {
  const name =
    boardId === DEFAULT_BOARD_ID
      ? DATA_DATABASE_NAME
      : `${DATA_DATABASE_NAME}-board-${boardId}`;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);

    request.onupgradeneeded = () => {
      const connection = request.result;
      connection.createObjectStore("tasks", { keyPath: "id" });
      connection.createObjectStore("timeEntries", { keyPath: "id" });
      connection.createObjectStore("settings", { keyPath: "id" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Не удалось открыть IndexedDB"));
  });
}

function openRegistry(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REGISTRY_DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      const connection = request.result;
      const boards = connection.createObjectStore("boards", { keyPath: "id" });
      connection.createObjectStore("settings", { keyPath: "id" });
      boards.put({ id: DEFAULT_BOARD_ID, name: "Моя доска", position: 0 });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Не удалось открыть список досок"));
  });
}

async function readAll<T>(boardId: string, storeName: string): Promise<T[]> {
  const connection = await openBoardData(boardId);
  try {
    return await requestResult<T[]>(
      connection.transaction(storeName).objectStore(storeName).getAll(),
    );
  } finally {
    connection.close();
  }
}

async function write(
  boardId: string,
  storeName: string,
  value: Task | TimeEntry | ActiveTimer,
): Promise<void> {
  const connection = await openBoardData(boardId);
  try {
    const transaction = connection.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction, "Не удалось сохранить запись");
  } finally {
    connection.close();
  }
}

async function remove(
  boardId: string,
  storeName: string,
  id: string,
): Promise<void> {
  const connection = await openBoardData(boardId);
  try {
    const transaction = connection.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    await transactionDone(transaction, "Не удалось удалить запись");
  } finally {
    connection.close();
  }
}

function forBoard(boardId: string) {
  return {
    tasks: () => readAll<Task>(boardId, "tasks"),
    entries: () => readAll<TimeEntry>(boardId, "timeEntries"),
    saveTask: (task: Task) => write(boardId, "tasks", task),
    saveTaskWithTime: async (
      task: Task,
      time: TimeEntry | ActiveTimer | null,
    ) => {
      if (!time) {
        await write(boardId, "tasks", task);
        return;
      }

      const timeStore = "startedAt" in time ? "settings" : "timeEntries";
      const connection = await openBoardData(boardId);
      try {
        const transaction = connection.transaction(
          ["tasks", timeStore],
          "readwrite",
        );
        transaction.objectStore("tasks").put(task);
        transaction.objectStore(timeStore).put(time);
        await transactionDone(transaction, "Не удалось сохранить задачу");
      } finally {
        connection.close();
      }
    },
    saveEntry: (entry: TimeEntry) => write(boardId, "timeEntries", entry),
    deleteTask: (id: string) => remove(boardId, "tasks", id),
    deleteEntry: (id: string) => remove(boardId, "timeEntries", id),
    activeTimer: async () => {
      const connection = await openBoardData(boardId);
      try {
        return await requestResult<ActiveTimer | undefined>(
          connection
            .transaction("settings")
            .objectStore("settings")
            .get("activeTimer"),
        );
      } finally {
        connection.close();
      }
    },
    finishTimer: async (entries: TimeEntry[]) => {
      const connection = await openBoardData(boardId);
      try {
        const transaction = connection.transaction(
          ["timeEntries", "settings"],
          "readwrite",
        );
        const entryStore = transaction.objectStore("timeEntries");
        entries.forEach((entry) => entryStore.put(entry));
        transaction.objectStore("settings").delete("activeTimer");
        await transactionDone(transaction, "Не удалось завершить таймер");
      } finally {
        connection.close();
      }
    },
  };
}

async function readBoards(): Promise<Board[]> {
  const connection = await openRegistry();
  try {
    const boards = await requestResult<Board[]>(
      connection.transaction("boards").objectStore("boards").getAll(),
    );
    return boards.sort((first, second) => first.position - second.position);
  } finally {
    connection.close();
  }
}

async function saveBoard(board: Board): Promise<void> {
  const connection = await openRegistry();
  try {
    const transaction = connection.transaction("boards", "readwrite");
    transaction.objectStore("boards").put(board);
    await transactionDone(transaction, "Не удалось сохранить доску");
  } finally {
    connection.close();
  }
}

async function selectedBoardId(): Promise<string | undefined> {
  const connection = await openRegistry();
  try {
    const selection = await requestResult<
      { id: string; boardId: string } | undefined
    >(
      connection
        .transaction("settings")
        .objectStore("settings")
        .get("selection"),
    );
    return selection?.boardId;
  } finally {
    connection.close();
  }
}

async function saveSelectedBoardId(boardId: string): Promise<void> {
  const connection = await openRegistry();
  try {
    const transaction = connection.transaction("settings", "readwrite");
    transaction.objectStore("settings").put({ id: "selection", boardId });
    await transactionDone(transaction, "Не удалось выбрать доску");
  } finally {
    connection.close();
  }
}

export const database = {
  forBoard,
  boards: readBoards,
  saveBoard,
  selectedBoardId,
  saveSelectedBoardId,
};
