const test = require("node:test");
const assert = require("node:assert/strict");
const { computeRisk } = require("../src/atRisk");

function isoDateFromToday(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test("computeRisk marks student at risk when two open items are overdue", () => {
  const result = computeRisk([
    { status: "not_started", due_date: isoDateFromToday(-2), visa_critical: false },
    { status: "in_progress", due_date: isoDateFromToday(-1), visa_critical: false },
  ]);

  assert.equal(result.atRisk, true);
  assert.equal(result.overdueCount, 2);
  assert.equal(result.reasons.includes("2 items overdue"), true);
});

test("computeRisk marks student at risk for visa-critical deadline within seven days", () => {
  const result = computeRisk([
    { status: "in_progress", due_date: isoDateFromToday(3), visa_critical: true },
  ]);

  assert.equal(result.atRisk, true);
  assert.equal(result.overdueCount, 0);
  assert.equal(result.reasons.includes("visa-critical item due within 7 days"), true);
});
