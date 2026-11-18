import { bunkAllowance, forecast, parseClassLength, parseTarget } from "./calculations.mjs";
import { parseCueText, sumHours } from "./import.mjs";

const $ = (selector) => document.querySelector(selector);
const editor = $("#editor");
const form = $("#dialog-form");
const storageKey = "cue-attendance-web-v1";
const initialState = { active: "first", terms: [{ id: "first", name: "Current semester", target: null, subjects: [] }] };
const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
let state;
let submit;
let statusTimer;
let storageAvailable = true;

try {
  state = JSON.parse(localStorage.getItem(storageKey)) ?? initialState;
} catch {
  state = initialState;
  storageAvailable = false;
}

function term(model = state) {
  return model.terms.find((item) => item.id === model.active);
}

function el(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text != null) item.textContent = text;
  return item;
}

function button(label, action, className, id) {
  const item = el("button", className, label);
  item.type = "button";
  item.dataset.action = action;
  if (id) item.dataset.id = id;
  return item;
}

function notify(message) {
  clearTimeout(statusTimer);
  const status = $("#status");
  status.textContent = message;
  status.hidden = false;
  statusTimer = setTimeout(() => { status.hidden = true; }, 4200);
}

function update(change) {
  const next = structuredClone(state);
  change(next);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    throw new Error("This browser couldn’t save the change. Check that site storage is enabled.");
  }
  state = next;
  render();
}

function qty(value, unit) {
  return `${value.toLocaleString()} ${unit}${value === 1 ? "" : unit === "class" ? "es" : "s"}`;
}

function ruler(value, goal, below) {
  const track = el("div", below ? "ruler below" : "ruler");
  track.setAttribute("aria-hidden", "true");
  const fill = el("div", "fill");
  fill.style.width = `${value ?? 0}%`;
  track.append(fill);
  if (goal != null) {
    const marker = el("span", "marker");
    marker.style.left = `${goal / 100}%`;
    track.append(marker);
  }
  return track;
}

function valueOf(counts) {
  return counts.total ? counts.attended / counts.total * 100 : null;
}

function percentText(value) {
  return value == null ? "—" : `${percent.format(value)}%`;
}

function recoveryText(result, length) {
  if (result.kind === "unreachable") return "Existing absences make a 100% target unreachable.";
  if (result.kind === "below-target") {
    const hours = qty(result.hours, "hour");
    return length
      ? `Attend ${qty(Math.ceil(result.hours / length), "class")} in a row (${hours} needed).`
      : `Attend ${hours} in a row to reach target.`;
  }
  return null;
}

function subjectCard(subject, overall) {
  const card = el("article", "subject");
  const value = valueOf(subject);
  const result = forecast(subject, subject.target);
  const recovery = recoveryText(result, subject.length);
  const heading = el("div", "card-heading");
  const title = el("div");
  title.append(el("h3", "", subject.name), el("p", "muted", subject.target == null
    ? "Target unset"
    : `${percentText(subject.target / 100)} target · ${qty(subject.length, "hour")} per class`));
  heading.append(title, el("strong", recovery ? "score warning" : "score", percentText(value)));
  const counts = el("p", "muted", `${subject.attended} of ${subject.total} hours attended`);
  const allowance = bunkAllowance(result, overall, subject.length);
  const projection = el("div", "projection");
  if (recovery) projection.append(el("p", "warning", recovery));
  if (result.kind === "empty") projection.append(el("p", "muted", "No classes recorded"));
  else if (allowance) {
    projection.append(el("p", "", `Can bunk ${qty(allowance.classes, "class")} · ${qty(allowance.hours, "hour")} available`));
  } else {
    projection.append(el("p", "muted", "Set both targets to see the bunk allowance."));
  }
  const actions = el("div", "card-actions");
  actions.append(button("＋ Attended", "attended", "log", subject.id),
    button("＋ Missed", "missed", "log", subject.id), button("Edit", "edit", "edit", subject.id));
  card.append(heading, ruler(value, subject.target, Boolean(recovery)), counts, projection, actions);
  return card;
}

function render() {
  const active = term();
  const counts = sumHours(active.subjects);
  const value = valueOf(counts);
  const result = forecast(counts, active.target);
  const recovery = recoveryText(result);
  $("#term").replaceChildren(...state.terms.map((item) => {
    const option = el("option", "", item.name);
    option.value = item.id;
    option.selected = item.id === active.id;
    return option;
  }));
  $("#overall-percent").textContent = percentText(value);
  $("#overall-target").textContent = active.target == null
    ? "Set overall target"
    : `${percentText(active.target / 100)} target · Edit`;
  $("#overall-ruler").replaceChildren(ruler(value, active.target, Boolean(recovery)));
  $("#overall-counts").textContent = counts.total
    ? `${counts.attended} of ${counts.total} hours attended`
    : "0 hours recorded";
  let summary = recovery;
  if (result.kind === "on-target") summary = `Can bunk up to ${qty(result.hours, "hour")} in a row overall.`;
  if (result.kind === "unset") summary = "Set a target to see your forecast.";
  if (result.kind === "empty") summary = active.subjects.length ? "No classes recorded" : "Add your subjects to start tracking.";
  $("#overall-forecast").textContent = summary;
  $("#subject-count").textContent = active.subjects.length;
  $("#empty").hidden = Boolean(active.subjects.length);
  $("#allowance-note").hidden = !active.subjects.length;
  $("#subjects").replaceChildren(...active.subjects.map((subject) => subjectCard(subject, result)));
}

function field(title, name, value = "", options = {}) {
  const label = el("label", "field", title);
  const input = el(options.multiline ? "textarea" : "input");
  input.name = name;
  input.value = value;
  input.required = Boolean(options.required);
  if (options.mode) input.inputMode = options.mode;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.maxLength) input.maxLength = options.maxLength;
  label.append(input);
  return label;
}

function showError(message = "") {
  $("#dialog-error").textContent = message;
  $("#dialog-error").hidden = !message;
}

function open(title, fields, accept, onSubmit) {
  $("#dialog-title").textContent = title;
  editor.setAttribute("aria-labelledby", "dialog-title");
  $("#dialog-fields").replaceChildren(...fields);
  $("#dialog-submit").textContent = accept;
  showError();
  submit = onSubmit;
  if (!editor.open) editor.showModal();
  ($("#dialog-fields").querySelector("input, textarea, button") ?? $("#dialog-submit")).focus();
}

function readInteger(value) {
  const text = value.trim();
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number > 1000000) {
    throw new Error("Enter whole hours between 0 and 1,000,000.");
  }
  return number;
}

function subjectEditor(subject) {
  open(subject ? "Edit subject" : "Add subject", [
    field("Subject name", "name", subject?.name, { required: true, maxLength: 120 }),
    field("Hours attended", "attended", subject?.attended ?? 0, { required: true, mode: "numeric" }),
    field("Total hours held", "total", subject?.total ?? 0, { required: true, mode: "numeric" }),
    field("Subject target (%)", "target", subject?.target == null ? "" : subject.target / 100, { mode: "decimal", placeholder: "Optional" }),
    field("Hours per class", "length", subject?.length ?? 1, { required: true, mode: "numeric" }),
    ...(subject ? [button("Remove subject", "remove", "remove", subject.id)] : []),
  ], subject ? "Save changes" : "Add subject", (data) => {
    const name = data.get("name").trim();
    if (!name) throw new Error("Enter a subject name.");
    const attended = readInteger(data.get("attended"));
    const total = readInteger(data.get("total"));
    if (attended > total) throw new Error("Attended hours can’t exceed total hours held.");
    const length = parseClassLength(data.get("length"));
    if (length > 1000000) throw new Error("Hours per class must be at most 1,000,000.");
    const target = parseTarget(data.get("target"));
    update((next) => {
      const { subjects } = term(next);
      if (subjects.some((row) => row.id !== subject?.id && row.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("A subject with that name already exists in this semester.");
      }
      const row = { id: subject?.id ?? crypto.randomUUID(), name, attended, total, length, target };
      if (subject) subjects[subjects.findIndex((item) => item.id === subject.id)] = row;
      else subjects.push(row);
    });
    return subject ? "Subject updated." : "Subject added.";
  });
}

function importEditor() {
  open("Import from CUE", [
    el("p", "muted", "Open Course Overview in grid view. Copy the subject cards as text and paste them here. You can also enter one line per subject in the format Name, attended, total."),
    field("Attendance text", "text", "", { multiline: true, required: true, placeholder: "Subject name, 18, 20" }),
  ], "Review import", (data) => {
    const rows = parseCueText(data.get("text"));
    const totals = sumHours(rows);
    const list = el("ul", "import-list");
    for (const row of rows) list.append(el("li", "", `${row.name} · ${row.attended} / ${row.total} hours`));
    open("Review import", [
      el("p", "muted", `${term().name} · ${totals.attended} of ${totals.total} hours across the pasted subjects`),
      list,
      el("p", "muted", "For matching subjects, these counts replace your current hours and keep your targets and class lengths. Other subjects stay as they are."),
    ], "Save import", () => {
      update((next) => {
        const { subjects } = term(next);
        for (const row of rows) {
          const existing = subjects.find((item) => item.name.toLowerCase() === row.name.toLowerCase());
          if (existing) Object.assign(existing, row);
          else subjects.push({ ...row, id: crypto.randomUUID(), length: 1, target: null });
        }
      });
      return `Imported ${rows.length} ${rows.length === 1 ? "subject" : "subjects"}.`;
    });
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const message = submit(new FormData(form));
    if (!message) return;
    editor.close();
    notify(message);
  } catch (error) {
    showError(error.message);
  }
});

$("#term").addEventListener("change", (event) => {
  try {
    update((next) => { next.active = event.target.value; });
  } catch (error) {
    render();
    notify(error.message);
  }
});

document.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-action]");
  if (!control) return;
  const { action, id } = control.dataset;
  const subject = term().subjects.find((item) => item.id === id);
  if (action === "close") editor.close();
  if (action === "add") subjectEditor();
  if (action === "edit" && subject) subjectEditor(subject);
  if (action === "import") importEditor();
  if (action === "target") {
    const goal = term().target;
    open("Overall target", [field("Target (%)", "target", goal == null ? "" : goal / 100, {
      mode: "decimal", placeholder: "Leave blank to clear",
    })], "Save target", (data) => {
      const target = parseTarget(data.get("target"));
      update((next) => { term(next).target = target; });
      return target == null ? "Overall target cleared." : "Overall target saved.";
    });
  }
  if (action === "term") {
    open("New semester", [field("Semester name", "name", "", { required: true, maxLength: 80 })],
      "Create semester", (data) => {
        const name = data.get("name").trim();
        if (!name || state.terms.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
          throw new Error("Enter a unique semester name.");
        }
        update((next) => {
          next.active = crypto.randomUUID();
          next.terms.push({ id: next.active, name, target: null, subjects: [] });
        });
        return "Semester created.";
      });
  }
  if (action === "remove" && subject) {
    open("Remove subject", [el("p", "muted", `Remove ${subject.name} and its attendance from this semester?`)], "Remove subject", () => {
      update((next) => { term(next).subjects = term(next).subjects.filter((item) => item.id !== id); });
      return "Subject removed.";
    });
  }
  if ((action === "attended" || action === "missed") && subject) {
    try {
      update((next) => {
        const row = term(next).subjects.find((item) => item.id === id);
        if (row.total + row.length > 1000000) throw new Error("The subject has reached the maximum recorded hours.");
        row.total += row.length;
        if (action === "attended") row.attended += row.length;
      });
      notify(`${subject.name} · ${qty(subject.length, "hour")} marked ${action}.`);
      [...$("#subjects").querySelectorAll("button")].find((item) => item.dataset.id === id &&
        item.dataset.action === action)?.focus();
    } catch (error) {
      notify(error.message);
    }
  }
});

render();
if (!storageAvailable) notify("Saved attendance couldn’t be read in this browser.");
