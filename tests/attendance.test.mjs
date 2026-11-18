import assert from "node:assert/strict";
import test from "node:test";
import { bunkAllowance, forecast, parseClassLength, parseTarget, settingKey } from "../attendance.mjs";

test("matches the screenshot totals and the 90% forecasts", () => {
  const subjects = [[52, 57], [59, 59], [30, 32], [30, 34], [13, 13]];
  const [attended, total] = subjects.reduce(([a, t], [b, u]) => [a + b, t + u], [0, 0]);
  assert.equal((attended / total * 100).toFixed(2), "94.36");
  const overall = forecast({ attended, total }, 9000);
  assert.deepEqual(overall, { kind: "on-target", hours: 9 });
  const design = forecast({ attended: 30, total: 34 }, 9000);
  assert.deepEqual(design, { kind: "below-target", hours: 6 });
  assert.equal(Math.ceil(design.hours / 2), 3);
  assert.deepEqual(bunkAllowance(design, overall, 2), { hours: 0, classes: 0 });
});

test("uses exact thresholds, even when display rounding suggests they were met", () => {
  assert.deepEqual(forecast({ attended: 9, total: 10 }, 9000), { kind: "on-target", hours: 0 });
  assert.deepEqual(forecast({ attended: 89999, total: 100000 }, 9000), { kind: "below-target", hours: 10 });
  assert.deepEqual(forecast({ attended: 10, total: 10 }, 10000), { kind: "on-target", hours: 0 });
  assert.deepEqual(forecast({ attended: 9, total: 10 }, 10000), { kind: "unreachable" });
  assert.deepEqual(forecast({ attended: 0, total: 0 }, 9000), { kind: "empty" });
});

test("uses the tighter limit and rounds down to whole classes", () => {
  const nine = { kind: "on-target", hours: 9 };
  const five = { kind: "on-target", hours: 5 };
  assert.deepEqual(bunkAllowance(nine, five, 2), { hours: 5, classes: 2 });
  assert.deepEqual(bunkAllowance(five, nine, 2), { hours: 5, classes: 2 });
  assert.deepEqual(bunkAllowance(nine, { kind: "below-target", hours: 2 }, 1), { hours: 0, classes: 0 });
  assert.equal(bunkAllowance({ kind: "unset" }, nine, 1), null);
  assert.equal(bunkAllowance({ kind: "empty" }, nine, 1), null);
});

test("validates settings and keys them by term and course identity", () => {
  assert.equal(parseTarget(""), null);
  assert.equal(parseTarget("90.01"), 9001);
  assert.equal(parseTarget("0.01"), 1);
  for (const invalid of ["0", "100.01", "90.001", "-9", "1e2"]) {
    assert.throws(() => parseTarget(invalid));
  }
  assert.equal(parseClassLength("2"), 2);
  for (const invalid of ["0", "1.5", "", "-1", "9007199254740992"]) {
    assert.throws(() => parseClassLength(invalid));
  }

  const row = { name: "UI/UX Design", code: "MCA523C-5", type: "Practical" };
  assert.equal(settingKey("v", row), settingKey("v", { ...row, name: "UI UX" }));
  assert.notEqual(settingKey("v", row), settingKey("iv", row));
  assert.notEqual(settingKey("v", row), settingKey("v", { ...row, type: "Theory" }));
});
