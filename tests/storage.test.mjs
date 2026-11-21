import test from "node:test";
import assert from "node:assert/strict";
import { commitModel, emptyModel, loadModel, storageKey } from "../web/storage.mjs";

test("loads existing static-app records using the same key and preserves settings and claims", () => {
  const original = { active: "term-2", terms: [
    { id: "first", name: "Old semester", target: null, subjects: [] },
    { id: "term-2", name: "Trimester V", target: 9000,
      subjects: [{ id: "design", name: "UI/UX Design", attended: 30, total: 34, length: 2, target: 9000 }],
      claims: { source: "manual", updatedAt: "2026-11-20T05:00:00Z", entries: [{ subjectId: "design", hours: 2 }] } },
  ] };
  const storage = { getItem(key) { assert.equal(key, "cue-attendance-web-v1"); return JSON.stringify(original); } };
  assert.deepEqual(loadModel(storage), original);
  assert.deepEqual(loadModel({ getItem: () => null }), emptyModel());
});

test("failed writes preserve the previous in-memory snapshot and retries start from it", () => {
  const original = emptyModel();
  const change = (next) => { next.terms[0].target = 9000; };
  assert.throws(() => commitModel(original, change, { setItem() { throw new Error("Quota exceeded"); } }), /couldn’t save/);
  assert.equal(original.terms[0].target, null);
  let saved;
  const next = commitModel(original, change, { setItem(key, value) { assert.equal(key, storageKey); saved = value; } });
  assert.equal(next.terms[0].target, 9000);
  assert.deepEqual(JSON.parse(saved), next);
  assert.equal(original.terms[0].target, null);
});

test("restores a valid selected semester and rejects unreadable storage", () => {
  const original = { ...emptyModel(), active: "removed" };
  assert.equal(loadModel({ getItem: () => JSON.stringify(original) }).active, "first");
  assert.throws(() => loadModel({ getItem: () => "invalid JSON" }));
  assert.throws(() => loadModel({ getItem: () => '{"terms":[]}' }), /couldn’t be read/);
});
