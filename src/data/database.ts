import type { ActiveTimer, Board, Task, TimeEntry } from "./model";
import {
  sampleBoards,
  sampleSelectedBoardId,
  sampleTasks,
} from "./sampleData.ts";

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
      const settings = connection.createObjectStore("settings", {
        keyPath: "id",
      });
      boards.put({ id: DEFAULT_BOARD_ID, name: "Моя доска", position: 0 });
      settings.put({ id: "sampleSeed", state: "new" });
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

let initializationPromise: Promise<boolean> | null = null;

function initialize(): Promise<boolean> {
  if (!initializationPromise) {
    initializationPromise = seedNewInstallation().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

async function seedNewInstallation(): Promise<boolean> {
  const connection = await openRegistry();
  let seedState: "new" | "seeding" | undefined;
  try {
    const marker = await requestResult<
      { id: string; state: "new" | "seeding" } | undefined
    >(
      connection
        .transaction("settings")
        .objectStore("settings")
        .get("sampleSeed"),
    );
    seedState = marker?.state;
  } finally {
    connection.close();
  }

  if (!seedState) return false;

  if (seedState === "new") {
    const [tasks, entries, timer] = await Promise.all([
      readAll<Task>(DEFAULT_BOARD_ID, "tasks"),
      readAll<TimeEntry>(DEFAULT_BOARD_ID, "timeEntries"),
      forBoard(DEFAULT_BOARD_ID).activeTimer(),
    ]);
    if (tasks.length || entries.length || timer) {
      const registry = await openRegistry();
      try {
        const transaction = registry.transaction("settings", "readwrite");
        transaction.objectStore("settings").delete("sampleSeed");
        await transactionDone(
          transaction,
          "Не удалось завершить проверку данных",
        );
      } finally {
        registry.close();
      }
      return false;
    }

    const registry = await openRegistry();
    try {
      const transaction = registry.transaction("settings", "readwrite");
      transaction.objectStore("settings").put({
        id: "sampleSeed",
        state: "seeding",
      });
      await transactionDone(transaction, "Не удалось начать создание примеров");
    } finally {
      registry.close();
    }
  }

  const now = new Date();
  for (const board of sampleBoards) {
    const data = await openBoardData(board.id);
    try {
      const transaction = data.transaction("tasks", "readwrite");
      const store = transaction.objectStore("tasks");
      sampleTasks(board.id, now).forEach((task) => store.put(task));
      await transactionDone(transaction, "Не удалось создать обучающие задачи");
    } finally {
      data.close();
    }
  }

  const registry = await openRegistry();
  try {
    const transaction = registry.transaction(
      ["boards", "settings"],
      "readwrite",
    );
    const boards = transaction.objectStore("boards");
    sampleBoards.forEach((board) => boards.put(board));
    const settings = transaction.objectStore("settings");
    settings.put({ id: "selection", boardId: sampleSelectedBoardId });
    settings.delete("sampleSeed");
    await transactionDone(transaction, "Не удалось создать стартовые доски");
  } finally {
    registry.close();
  }

  return true;
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

async function reorderBoards(boardIds: string[]): Promise<Board[]> {
  const currentBoards = await readBoards();
  const boardsById = new Map(currentBoards.map((board) => [board.id, board]));
  if (
    boardIds.length !== currentBoards.length ||
    new Set(boardIds).size !== currentBoards.length ||
    boardIds.some((id) => !boardsById.has(id))
  ) {
    throw new Error("Invalid board order");
  }

  const orderedBoards = boardIds.map((id, position) => ({
    ...boardsById.get(id)!,
    position,
  }));
  const connection = await openRegistry();
  try {
    const transaction = connection.transaction("boards", "readwrite");
    const store = transaction.objectStore("boards");
    orderedBoards.forEach((board) => store.put(board));
    await transactionDone(transaction, "Не удалось изменить порядок досок");
    return orderedBoards;
  } finally {
    connection.close();
  }
}

async function insertBoard(board: Board, index: number): Promise<Board[]> {
  const currentBoards = await readBoards();
  const orderedBoards = [...currentBoards];
  orderedBoards.splice(index, 0, board);
  const updatedBoards = orderedBoards.map((item, position) => ({
    ...item,
    position,
  }));

  const connection = await openRegistry();
  try {
    const transaction = connection.transaction(
      ["boards", "settings"],
      "readwrite",
    );
    const store = transaction.objectStore("boards");
    updatedBoards.forEach((item) => store.put(item));
    transaction
      .objectStore("settings")
      .put({ id: "selection", boardId: board.id });
    await transactionDone(transaction, "Не удалось добавить доску");
    return updatedBoards;
  } finally {
    connection.close();
  }
}

async function deleteBoard(
  boardId: string,
  nextBoardId: string,
  replacement?: Board,
): Promise<void> {
  const connection = await openRegistry();
  try {
    const transaction = connection.transaction(
      ["boards", "settings"],
      "readwrite",
    );
    const store = transaction.objectStore("boards");
    if (replacement) store.put(replacement);
    store.delete(boardId);
    transaction
      .objectStore("settings")
      .put({ id: "selection", boardId: nextBoardId });
    await transactionDone(transaction, "Не удалось удалить доску");
  } finally {
    connection.close();
  }

  const databaseName =
    boardId === DEFAULT_BOARD_ID
      ? DATA_DATABASE_NAME
      : `${DATA_DATABASE_NAME}-board-${boardId}`;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("Не удалось очистить данные доски"));
    request.onblocked = () =>
      reject(new Error("База данных доски занята в другой вкладке"));
  });
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
  initialize,
  forBoard,
  boards: readBoards,
  saveBoard,
  reorderBoards,
  insertBoard,
  deleteBoard,
  selectedBoardId,
  saveSelectedBoardId,
};
