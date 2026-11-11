import assert from "node:assert/strict";
import test from "node:test";
import { edgeAction } from "../src/boardNavigation.ts";

const boards = [
  { id: "left", name: "Левая", position: 0 },
  { id: "middle", name: "Средняя", position: 1 },
  { id: "right", name: "Правая", position: 2 },
];

test("edge controls navigate to neighbors and create at list ends", () => {
  assert.deepEqual(edgeAction(boards, "middle", -1, false), {
    kind: "navigate",
    targetId: "left",
  });
  assert.deepEqual(edgeAction(boards, "middle", 1, false), {
    kind: "navigate",
    targetId: "right",
  });
  assert.deepEqual(edgeAction(boards, "left", -1, false), {
    kind: "create",
  });
  assert.deepEqual(edgeAction(boards, "right", 1, false), {
    kind: "create",
  });
});

test("Shift swaps create and navigation, wrapping only at the ends", () => {
  assert.deepEqual(edgeAction(boards, "middle", -1, true), {
    kind: "create",
  });
  assert.deepEqual(edgeAction(boards, "middle", 1, true), {
    kind: "create",
  });
  assert.deepEqual(edgeAction(boards, "left", -1, true), {
    kind: "navigate",
    targetId: "right",
  });
  assert.deepEqual(edgeAction(boards, "right", 1, true), {
    kind: "navigate",
    targetId: "left",
  });
  assert.deepEqual(edgeAction([boards[0]], "left", -1, true), {
    kind: "create",
  });
});
