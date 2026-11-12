import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { database } from "../src/data/database.ts";

test("fresh storage gets three themed boards and opens the second", async () => {
  assert.equal(await database.initialize(), true);

  const boards = await database.boards();
  assert.deepEqual(
    boards.map(({ id, name }) => ({ id, name })),
    [
      { id: "main", name: "Личный день" },
      { id: "work", name: "Работа и проекты" },
      { id: "learning", name: "Учёба и идеи" },
    ],
  );
  assert.equal(await database.selectedBoardId(), "work");

  for (const board of boards) {
    const tasks = await database.forBoard(board.id).tasks();
    assert.ok(tasks.length >= 3);
    assert.ok(tasks.every((task) => task.project && task.note));
  }

  assert.equal(await database.initialize(), true);
  assert.equal((await database.forBoard("work").tasks()).length, 4);
});
