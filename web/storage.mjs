export const storageKey = "cue-attendance-web-v1";

export function emptyModel() {
  return { active: "first", terms: [{ id: "first", name: "Current semester", target: null, subjects: [] }] };
}

export function loadModel(storage) {
  const saved = JSON.parse(storage.getItem(storageKey));
  if (saved == null) return emptyModel();
  if (!Array.isArray(saved.terms) || !saved.terms.length || saved.terms.some((term) =>
    typeof term.id !== "string" || typeof term.name !== "string" || !Array.isArray(term.subjects))) {
    throw new Error("Saved attendance couldn’t be read in this browser.");
  }
  if (!saved.terms.some((term) => term.id === saved.active)) saved.active = saved.terms[0].id;
  return saved;
}

export function commitModel(model, change, storage) {
  const next = structuredClone(model);
  change(next);
  try {
    storage.setItem(storageKey, JSON.stringify(next));
  } catch {
    throw new Error("This browser couldn’t save the change. Check that site storage is enabled.");
  }
  return next;
}
