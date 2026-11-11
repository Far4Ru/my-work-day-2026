import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { database } from "../src/database.ts";

function openLegacyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("todo-did", 1);
    request.onupgradeneeded = () => {
      const connection = request.result;
      connection.createObjectStore("tasks", { keyPath: "id" });
      connection.createObjectStore("timeEntries", { keyPath: "id" });
      connection.createObjectStore("settings", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

function task(id) {
  return {
    id,
    title: id,
    project: "",
    note: "",
    date: "2026-11-12",
    dueTime: "",
    estimateMinutes: 0,
    status: "todo",
    createdAt: "2026-11-12T08:00:00.000Z",
    completedAt: null,
  };
}

test("new boards keep tasks and timers separate without losing legacy data", async () => {
  const legacyConnection = await openLegacyDatabase();
  const legacyTransaction = legacyConnection.transaction(
    ["tasks", "settings"],
    "readwrite",
  );
  legacyTransaction.objectStore("tasks").put(task("legacy-task"));
  legacyTransaction.objectStore("settings").put({
    id: "activeTimer",
    taskId: "legacy-task",
    title: "Legacy timer",
    startedAt: "2026-11-12T08:00:00.000Z",
  });
  await transactionDone(legacyTransaction);
  legacyConnection.close();

  assert.deepEqual(await database.boards(), [
    { id: "main", name: "Моя доска", position: 0 },
  ]);

  const main = database.forBoard("main");
  assert.deepEqual(
    (await main.tasks()).map((item) => item.id),
    ["legacy-task"],
  );
  assert.equal((await main.activeTimer())?.title, "Legacy timer");

  await database.saveBoard({ id: "second", name: "Доска 2", position: 1 });
  const second = database.forBoard("second");
  assert.deepEqual(await second.tasks(), []);
  assert.equal(await second.activeTimer(), undefined);

  await second.saveTaskWithTime(task("new-task"), {
    id: "activeTimer",
    taskId: "new-task",
    title: "New timer",
    startedAt: "2026-11-12T09:00:00.000Z",
  });

  assert.deepEqual(
    (await second.tasks()).map((item) => item.id),
    ["new-task"],
  );
  assert.deepEqual(
    (await main.tasks()).map((item) => item.id),
    ["legacy-task"],
  );
  assert.equal((await second.activeTimer())?.title, "New timer");
  assert.equal((await main.activeTimer())?.title, "Legacy timer");

  await second.saveEntry({
    id: "new-entry",
    taskId: "new-task",
    title: "New work",
    date: "2026-11-12",
    minutes: 30,
    createdAt: "2026-11-12T09:30:00.000Z",
  });
  assert.deepEqual(await main.entries(), []);
  assert.deepEqual(
    (await second.entries()).map((entry) => entry.id),
    ["new-entry"],
  );

  await database.saveBoard({ id: "second", name: "Новая доска", position: 1 });
  assert.equal((await database.boards())[1].name, "Новая доска");

  await database.saveSelectedBoardId("second");
  assert.equal(await database.selectedBoardId(), "second");
});
