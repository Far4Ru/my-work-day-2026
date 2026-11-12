import assert from "node:assert/strict";
import test from "node:test";
import { dateFromIsoWeekKey, isoWeekKey } from "../src/lib/dates.ts";

test("week input uses ISO weeks across calendar-year boundaries", () => {
  assert.equal(isoWeekKey("2021-01-01"), "2020-W53");
  assert.equal(dateFromIsoWeekKey("2020-W53"), "2020-12-28");
  assert.equal(isoWeekKey("2026-11-11"), "2026-W46");
  assert.equal(dateFromIsoWeekKey("2026-W46"), "2026-11-09");
  assert.equal(dateFromIsoWeekKey("2021-W53"), null);
});
