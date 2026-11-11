import assert from 'node:assert/strict';
import test from 'node:test';
import { entriesFromTimer } from '../src/timer.ts';

test('a timer crossing midnight allocates minutes to both local dates', () => {
  const start = new Date(2026, 10, 11, 23, 58);
  const end = new Date(2026, 10, 12, 0, 3);
  const timer = {
    id: 'activeTimer',
    title: 'Работа',
    taskId: null,
    startedAt: start.toISOString(),
  };

  const entries = entriesFromTimer(timer, end);

  assert.deepEqual(
    entries.map(({ date, minutes }) => ({ date, minutes })),
    [
      { date: '2026-11-11', minutes: 2 },
      { date: '2026-11-12', minutes: 3 },
    ],
  );
});
