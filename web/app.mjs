import { bunkAllowance, forecast, parseClassLength, parseTarget } from "./calculations.mjs";
import { parseCueText, sumHours } from "./import.mjs";
import { attendanceCsv, matchName, readCueReport } from "./cue-report.mjs";
import { track } from "./analytics.mjs";

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

function ruler(value, goal) {
  const track = el("div", "ruler");
  track.setAttribute("aria-hidden", "true");
  if (value != null && value < 75) track.classList.add("fill-red");
  else if (value != null && value < 85) track.classList.add("fill-yellow");
  const fill = el("div", "fill");
  fill.style.width = `${value ?? 0}%`;
  track.append(fill);
  if (goal != null) {
    track.classList.add("has-goal");
    track.style.setProperty("--goal", `${goal / 100}%`);
    track.append(el("span", "marker"), el("span", "marker-label", percentText(goal / 100)));
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
  const logged = el("p", "class-feedback");
  logged.setAttribute("role", "status");
  card.append(heading, ruler(value, subject.target), counts, projection, actions, logged);
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
  $("#overall-ruler").replaceChildren(ruler(value, active.target));
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

function open(title, fields, accept, onSubmit, { destructive = false } = {}) {
  $("#dialog-title").textContent = title;
  editor.setAttribute("aria-labelledby", "dialog-title");
  $("#dialog-fields").replaceChildren(...fields);
  $("#dialog-submit").textContent = accept;
  $("#dialog-submit").disabled = false;
  $("#dialog-submit").classList.toggle("danger", destructive);
  showError();
  submit = onSubmit;
  if (!editor.open) editor.showModal();
  const firstControl = $("#dialog-fields").querySelector("input, textarea, button");
  (destructive ? $("#dialog-actions [data-action='close']") : firstControl ?? $("#dialog-submit")).focus();
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
    if (target != null && target !== subject?.target) {
      track("attendance_target_saved", { scope: "subject" });
    }
    return subject ? "Subject updated." : "Subject added.";
  });
}

function previewImport(rows, fileName) {
  const active = term();
  const totals = sumHours(rows);
  const list = el("ul", "import-list");
  for (const row of rows) {
    const existing = active.subjects.find((item) => matchName(item.name) === matchName(row.name));
    const before = existing ? `${existing.attended} / ${existing.total} → ` : "";
    const annotation = existing ? "" : " · New subject";
    list.append(el("li", "", `${row.name} · ${before}${row.attended} / ${row.total} hours${annotation}`));
  }
  const download = el("button", "secondary csv-download", "Download CSV");
  download.type = "button";
  download.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([attendanceCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = el("a");
    link.href = url;
    link.download = "cue-attendance.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  open("Review import", [
    el("p", "muted", `Import into ${active.name} · ${totals.attended} of ${totals.total} hours`),
    ...(fileName ? [el("p", "muted report-name", fileName)] : []),
    list,
    el("p", "muted", "Saving replaces the hours for matching subjects and keeps their targets and class lengths. Subjects absent from the file stay as they are."),
    download,
  ], "Save import", () => {
    update((next) => {
      const { subjects } = term(next);
      for (const row of rows) {
        const existing = subjects.find((item) => matchName(item.name) === matchName(row.name));
        if (existing) Object.assign(existing, { attended: row.attended, total: row.total });
        else subjects.push({ ...row, id: crypto.randomUUID(), length: 1, target: null });
      }
    });
    track("attendance_imported", { method: fileName ? "pdf" : "paste" });
    return `Imported ${rows.length} ${rows.length === 1 ? "subject" : "subjects"}.`;
  });
}

function importEditor() {
  const fileField = field("Attendance report (PDF)", "report");
  const fileInput = fileField.querySelector("input");
  fileInput.type = "file";
  fileInput.accept = ".pdf,application/pdf";
  const fallback = el("details", "import-fallback");
  fallback.append(
    el("summary", "", "Paste attendance instead"),
    field("Attendance text", "text", "", {
      multiline: true, placeholder: "Paste CUE course cards or enter Subject name, 18, 20",
    }),
  );
  open("Import from CUE", [
    el("p", "muted", "In CUE, choose Attendance → Course Overview → Download Report. Select the PDF below to convert it to CSV in your browser."),
    fileField,
    fallback,
  ], "Review import", async (data, stillCurrent) => {
    const file = data.get("report");
    const pasted = data.get("text").trim();
    if (file.size && pasted) throw new Error("Choose a PDF or paste attendance text, then try again.");
    if (!file.size && !pasted) throw new Error("Select a CUE PDF report or paste attendance text.");
    if (file.size) {
      const save = $("#dialog-submit");
      save.textContent = "Reading PDF…";
      try {
        const rows = await readCueReport(file);
        if (stillCurrent()) previewImport(rows, file.name);
      } finally {
        if (stillCurrent()) save.textContent = "Review import";
      }
    } else {
      previewImport(parseCueText(pasted));
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = submit;
  const save = $("#dialog-submit");
  if (save.disabled) return;
  save.disabled = true;
  showError();
  const stillCurrent = () => editor.open && submit === action;
  try {
    const message = await action(new FormData(form), stillCurrent);
    if (!message || !stillCurrent()) return;
    editor.close();
    notify(message);
  } catch (error) {
    if (stillCurrent()) showError(error.message);
  } finally {
    if (stillCurrent()) save.disabled = false;
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
      if (target != null && target !== goal) track("attendance_target_saved", { scope: "overall" });
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
  if (action === "delete-term") {
    const current = term();
    open("Delete semester", [
      el("p", "muted", `Delete “${current.name}” and all of its subjects, attendance, and targets? This action is permanent.`),
    ], "Delete semester", () => {
      update((next) => {
        const index = next.terms.findIndex((item) => item.id === current.id);
        next.terms.splice(index, 1);
        if (!next.terms.length) {
          next.terms.push({ id: crypto.randomUUID(), name: "Current semester", target: null, subjects: [] });
        }
        next.active = next.terms[Math.min(index, next.terms.length - 1)].id;
      });
      return "Semester deleted.";
    }, { destructive: true });
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
      track("class_logged");
      const logButton = [...$("#subjects").querySelectorAll("button")].find((item) =>
        item.dataset.id === id && item.dataset.action === action);
      logButton?.focus({ preventScroll: true });
      const card = logButton?.closest(".subject");
      if (card) {
        const logged = card.querySelector(".class-feedback");
        logged.classList.toggle("is-missed", action === "missed");
        logged.textContent = `${qty(subject.length, "hour")} marked ${action}.`;
        card.classList.add("class-updated");
        setTimeout(() => {
          card.classList.remove("class-updated");
          logged.textContent = "";
        }, 2500);
      }
    } catch (error) {
      notify(error.message);
    }
  }
});

render();
if (!storageAvailable) notify("Saved attendance couldn’t be read in this browser.");

const portfolioEnvelope = $("#portfolio-envelope");
const portfolioSummary = portfolioEnvelope.querySelector("summary");
const portfolioFooter = portfolioEnvelope.parentElement;
const mobileHeader = matchMedia("(max-width: 660px)");
let portfolioPreview = false;

function placePortfolioEnvelope() {
  if (mobileHeader.matches) {
    $("#feedback-button").after(portfolioEnvelope);
  } else {
    portfolioFooter.append(portfolioEnvelope);
  }
  portfolioFooter.hidden = mobileHeader.matches;
}

placePortfolioEnvelope();
mobileHeader.addEventListener("change", placePortfolioEnvelope);

portfolioEnvelope.addEventListener("pointerenter", (event) => {
  if (event.pointerType !== "mouse" || portfolioEnvelope.open) return;
  portfolioPreview = true;
  portfolioEnvelope.open = true;
});

function closePortfolioPreview() {
  if (!portfolioPreview || portfolioEnvelope.matches(":hover, :focus-within")) return;
  portfolioPreview = false;
  portfolioEnvelope.open = false;
}

portfolioEnvelope.addEventListener("pointerleave", closePortfolioPreview);
portfolioEnvelope.addEventListener("focusout", () => queueMicrotask(closePortfolioPreview));
portfolioSummary.addEventListener("click", (event) => {
  if (!portfolioPreview) return;
  event.preventDefault();
  portfolioPreview = false;
});
portfolioEnvelope.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !portfolioEnvelope.open) return;
  event.preventDefault();
  portfolioPreview = false;
  portfolioEnvelope.open = false;
  portfolioSummary.focus();
});

const feedbackDialog = $("#feedback-dialog");
const feedbackForm = $("#feedback-form");
const feedbackPrompt = $("#feedback-prompt");
const feedbackStatus = $("#feedback-status");
const feedbackSend = $("#feedback-send");
const feedbackPromptKey = "cue-feedback-invitation-dismissed";
const feedbackHost = "https://attendance-tracker.yanish.me";
const feedbackHosts = new Set([new URL(feedbackHost).hostname, "cue-attendance-tracker.netlify.app"]);

try {
  feedbackPrompt.hidden = sessionStorage.getItem(feedbackPromptKey) === "yes";
} catch {
  feedbackPrompt.hidden = false;
}

function dismissFeedbackPrompt() {
  feedbackPrompt.hidden = true;
  try { sessionStorage.setItem(feedbackPromptKey, "yes"); } catch { /* Dismissed for this page. */ }
}

function openFeedback() {
  dismissFeedbackPrompt();
  feedbackDialog.showModal();
}

function feedbackMessage(message, error = false) {
  feedbackStatus.hidden = false;
  feedbackStatus.textContent = message;
  feedbackStatus.classList.toggle("error", error);
}

$("#feedback-button").addEventListener("click", openFeedback);
$("#feedback-invitation").addEventListener("click", openFeedback);
$("#feedback-dismiss").addEventListener("click", () => {
  dismissFeedbackPrompt();
  $("#feedback-button").focus();
});
$("#feedback-close").addEventListener("click", () => feedbackDialog.close());
feedbackDialog.addEventListener("close", () => $("#feedback-button").focus());

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (feedbackSend.disabled) return;
  const formData = new FormData(feedbackForm);
  // Netlify inserts this field at deploy time. Setting it also covers static previews.
  formData.set("form-name", "tracker-feedback");
  const message = formData.get("message").trim();
  const image = formData.get("image");
  const attachment = formData.get("attachment");
  if (!message && !image.size && !attachment.size) {
    feedbackMessage("Write a message or choose a file to send.", true);
    return;
  }
  if (image.size + attachment.size > 7000000) {
    feedbackMessage("Choose files that total 7 MB or less.", true);
    return;
  }
  if (image.size && !image.type.startsWith("image/")) {
    feedbackMessage("Choose an image for the Image field, or use Other file.", true);
    return;
  }
  if (!feedbackHosts.has(location.hostname)) {
    feedbackMessage("Feedback is available on the live tracker.");
    const link = el("a", "", "Open live tracker");
    link.href = feedbackHost;
    feedbackStatus.append(" ", link);
    return;
  }
  feedbackSend.disabled = true;
  feedbackMessage("Sending feedback…");
  try {
    const response = await fetch("/", {
      method: "POST", body: formData, signal: AbortSignal.timeout(35000),
    });
    if (!response.ok) throw new Error("Feedback submission failed.");
    track("feedback_submitted");
      feedbackForm.reset();
      feedbackStatus.hidden = true;
      feedbackStatus.textContent = "";
      feedbackDialog.close();
      $("#feedback-thanks").showModal();
  } catch {
    feedbackMessage("Feedback couldn’t be sent. Your message is still here. Try again.", true);
  } finally {
    feedbackSend.disabled = false;
  }
});
