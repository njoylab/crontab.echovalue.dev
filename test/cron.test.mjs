import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExpression } from "../cron.mjs";

process.env.TZ = "UTC";

function at(t, now, timezone = "UTC") {
  const previous = process.env.TZ;
  process.env.TZ = timezone;
  t.after(() => { process.env.TZ = previous; });
  t.mock.timers.enable({ apis: ["Date"], now: new Date(now).getTime() });
}

function runs(expression) {
  const state = parseExpression(expression);
  assert.equal(state.valid, true, state.error);
  return state.nextRuns.map(date => date.toISOString());
}

for (const expression of [
  "5abc * * * *", "*/2x * * * *", "*/ * * * *", "1-2-3 * * * *",
  "*/2/3 * * * *", "1/ * * * *", "1,,2 * * * *", "1.5 * * * *",
  "+1 * * * *", "*/0 * * * *", "*/9007199254740992 * * * *",
  "60 * * * *", "0 24 * * *", "0 0 0 * *", "0 0 * 13 *",
  "0 0 * * 8", "0 0 * JANUARY *", "0 0 * * FRI-MON", "* * * * * *", "@reboot", "",
]) {
  test(`rejects malformed or unsupported expression: ${expression}`, () => {
    assert.equal(parseExpression(expression).valid, false);
  });
}

test("supports steps, lists, names, whitespace and case without changing their schedule", t => {
  at(t, "2026-10-29T12:00:30Z");
  assert.deepEqual(runs("  5-20/5,40\t12 * oct thu  "), [
    "2026-10-29T12:05:00.000Z", "2026-10-29T12:10:00.000Z", "2026-10-29T12:15:00.000Z",
    "2026-10-29T12:20:00.000Z", "2026-10-29T12:40:00.000Z",
  ]);
});

for (const weekday of ["1-7", "0-7"]) {
  test(`weekday range ${weekday} includes every day`, t => {
    at(t, "2026-10-29T12:00:00Z");
    assert.deepEqual(runs(`0 0 * * ${weekday}`), [
      "2026-10-30T00:00:00.000Z", "2026-10-31T00:00:00.000Z", "2026-11-01T00:00:00.000Z",
      "2026-11-02T00:00:00.000Z", "2026-11-03T00:00:00.000Z",
    ]);
  });
}

test("weekday range steps apply before normalizing Sunday 7", t => {
  at(t, "2026-10-29T12:00:00Z");
  assert.deepEqual(runs("0 0 * * 5-7/2"), [
    "2026-10-30T00:00:00.000Z", "2026-11-01T00:00:00.000Z", "2026-11-06T00:00:00.000Z",
    "2026-11-08T00:00:00.000Z", "2026-11-13T00:00:00.000Z",
  ]);
});

test("wildcard steps intersect the other day field", t => {
  at(t, "2026-10-29T12:00:00Z");
  assert.deepEqual(runs("0 0 */1 * MON"), [
    "2026-11-02T00:00:00.000Z", "2026-11-09T00:00:00.000Z", "2026-11-16T00:00:00.000Z",
    "2026-11-23T00:00:00.000Z", "2026-11-30T00:00:00.000Z",
  ]);
  assert.deepEqual(runs("0 0 1 * */2"), [
    "2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z", "2027-04-01T00:00:00.000Z",
    "2027-05-01T00:00:00.000Z", "2027-06-01T00:00:00.000Z",
  ]);
});

test("restricted day fields use OR, while stepped wildcards retain their day filter", t => {
  at(t, "2026-10-29T12:00:00Z");
  assert.deepEqual(runs("0 0 1 * MON"), [
    "2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z", "2026-11-09T00:00:00.000Z",
    "2026-11-16T00:00:00.000Z", "2026-11-23T00:00:00.000Z",
  ]);
  assert.deepEqual(runs("0 0 */2 * MON"), [
    "2026-11-09T00:00:00.000Z", "2026-11-23T00:00:00.000Z", "2026-12-07T00:00:00.000Z",
    "2026-12-21T00:00:00.000Z", "2027-01-11T00:00:00.000Z",
  ]);
});

test("annual and leap-day schedules return five runs beyond the old one-year window", t => {
  at(t, "2026-10-29T12:00:00Z");
  assert.deepEqual(runs("@yearly"), [
    "2027-01-01T00:00:00.000Z", "2028-01-01T00:00:00.000Z", "2029-01-01T00:00:00.000Z",
    "2030-01-01T00:00:00.000Z", "2031-01-01T00:00:00.000Z",
  ]);
  assert.deepEqual(runs("0 0 29 FEB *"), [
    "2028-02-29T00:00:00.000Z", "2032-02-29T00:00:00.000Z", "2036-02-29T00:00:00.000Z",
    "2040-02-29T00:00:00.000Z", "2044-02-29T00:00:00.000Z",
  ]);
});

test("century years are not treated as leap years", t => {
  at(t, "2096-03-01T00:00:00Z");
  assert.deepEqual(runs("0 0 29 FEB *"), [
    "2104-02-29T00:00:00.000Z", "2108-02-29T00:00:00.000Z", "2112-02-29T00:00:00.000Z",
    "2116-02-29T00:00:00.000Z", "2120-02-29T00:00:00.000Z",
  ]);
});

test("impossible dates return an explicit bounded-preview notice", t => {
  at(t, "2026-10-29T12:00:00Z");
  const state = parseExpression("0 0 31 FEB *");
  assert.equal(state.valid, true);
  assert.deepEqual(state.nextRuns, []);
  assert.match(state.previewNotice, /No matching runs.*32 years/);
});

test("descriptions combine clock time, enumerate mixed steps and explain day operators", t => {
  at(t, "2026-10-29T12:00:00Z");
  assert.equal(parseExpression("15 14 1 * *").explanation, "At 14:15. On day 1 of the month. Every month.");
  assert.match(parseExpression("*/15,7 * * * *").explanation, /At minutes 0, 7, 15, 30, and 45 past every hour/);
  assert.match(parseExpression("0 0 1 * MON").explanation, /On day 1 of the month or on Monday/);
  assert.match(parseExpression("0 0 */2 * MON").explanation, / and on Monday/);
});

test("preview starts strictly after now and does not mutate the clock", t => {
  at(t, "2026-10-29T12:00:00Z");
  assert.equal(runs("* * * * *")[0], "2026-10-29T12:01:00.000Z");
  assert.equal(new Date().toISOString(), "2026-10-29T12:00:00.000Z");
});

test("spring DST skips nonexistent local times", t => {
  at(t, "2027-03-27T23:00:00Z", "Europe/Rome");
  assert.equal(runs("30 2 * * *")[0], "2027-03-29T00:30:00.000Z");
});

test("autumn DST includes both occurrences in chronological order", t => {
  at(t, "2026-10-24T23:00:00Z", "Europe/Rome");
  assert.deepEqual(runs("30 2 * * *").slice(0, 3), [
    "2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z", "2026-10-26T01:30:00.000Z",
  ]);
});
