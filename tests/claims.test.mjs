import test from "node:test";
import assert from "node:assert/strict";
import { projectClaims } from "../web/claims.mjs";
import { forecast, bunkAllowance } from "../web/calculations.mjs";
import { sumHours } from "../web/import.mjs";

const subjects = [
  { id: "ami", name: "Applied Machine Intelligence", attended: 52, total: 57, target: 9000, length: 1 },
  { id: "devops", name: "Devops", attended: 59, total: 59, target: 9000, length: 1 },
  { id: "forensics", name: "Digital Forensics", attended: 30, total: 32, target: 9000, length: 1 },
  { id: "design", name: "UI/UX Design", attended: 30, total: 34, target: 9000, length: 2 },
  { id: "extra", name: "Extracurricular", attended: 13, total: 13, target: 9000, length: 1 },
];
const entries = [{ subjectId: "ami", hours: 1 }, { subjectId: "forensics", hours: 2 }];

test("projects manually entered pending hours with exact counts and reused forecasts", () => {
  const projected = projectClaims(subjects, entries);
  assert.deepEqual(sumHours(subjects), { attended: 184, total: 195 });
  assert.deepEqual(sumHours(projected), { attended: 187, total: 195 });
  assert.equal((187 / 195 * 100).toFixed(2), "95.90");
  assert.equal(projected[0].attended, 53);
  assert.equal(projected[2].attended, 32);
  assert.equal(subjects[0].attended, 52);
  const overall = forecast(sumHours(projected), 9000);
  assert.equal(overall.hours, 12);
  const design = forecast(projected[3], 9000);
  assert.deepEqual(design, { kind: "below-target", hours: 6 });
  assert.deepEqual(bunkAllowance(design, overall, 2), { hours: 0, classes: 0 });
  assert.deepEqual(projectClaims(subjects, entries), projected);
  assert.deepEqual(projectClaims(subjects).map(({ claimHours }) => claimHours), [0, 0, 0, 0, 0]);
});

test("rejects excessive claims, combined assignments, removed subjects and invalid saved hours", () => {
  assert.throws(() => projectClaims(subjects, [{ subjectId: "ami", hours: 6 }]), /exceed/);
  assert.throws(() => projectClaims(subjects, [{ subjectId: "ami", hours: 3 }, { subjectId: "ami", hours: 3 }]), /exceed/);
  assert.throws(() => projectClaims(subjects, [{ subjectId: "", hours: 1 }]), /missing/);
  assert.throws(() => projectClaims(subjects.filter((subject) => subject.id !== "ami"), entries), /missing/);
  assert.throws(() => projectClaims(subjects, [{ subjectId: "ami", hours: -1 }]), /invalid/);
  assert.throws(() => projectClaims(subjects, [{ subjectId: "ami", hours: 1.5 }]), /invalid/);
});
