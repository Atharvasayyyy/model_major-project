const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseTimeWindow,
  buildTimeMatch,
  VALID_WINDOWS,
} = require("../src/utils/timeWindow");

test("parses 'today' to local midnight start", () => {
  const { start, end } = parseTimeWindow("today");
  assert.ok(start);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.ok(end > start);
});

test("parses '7d' to 7 days before now", () => {
  const { start, end } = parseTimeWindow("7d");
  const diffDays = (end - start) / (1000 * 60 * 60 * 24);
  assert.ok(
    Math.abs(diffDays - 7) < 0.01,
    `Expected ~7 days, got ${diffDays}`,
  );
});

test("parses '30d' to 30 days before now", () => {
  const { start, end } = parseTimeWindow("30d");
  const diffDays = (end - start) / (1000 * 60 * 60 * 24);
  assert.ok(
    Math.abs(diffDays - 30) < 0.01,
    `Expected ~30 days, got ${diffDays}`,
  );
});

test("parses 'all' returns null start", () => {
  const { start } = parseTimeWindow("all");
  assert.equal(start, null);
});

test("defaults to '7d' for missing window", () => {
  const { window } = parseTimeWindow(undefined);
  assert.equal(window, "7d");
});

test("throws for invalid window", () => {
  assert.throws(() => parseTimeWindow("invalid"), /Invalid window/);
});

test("buildTimeMatch returns empty object for 'all'", () => {
  const match = buildTimeMatch("all");
  assert.deepEqual(match, {});
});

test("buildTimeMatch returns proper $gte/$lte filter for '7d'", () => {
  const match = buildTimeMatch("7d");
  assert.ok(match.timestamp);
  assert.ok(match.timestamp.$gte instanceof Date);
  assert.ok(match.timestamp.$lte instanceof Date);
});

test("buildTimeMatch supports custom field name", () => {
  const match = buildTimeMatch("7d", "started_at");
  assert.ok(match.started_at);
  assert.equal(match.timestamp, undefined);
});
