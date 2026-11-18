import {
  bunkAllowance, forecast, parseClassLength, parseTarget, settingKey, subjectKey, termStorageKey,
} from "./attendance.mjs";
import { isAttendanceUrl, readCueAttendance } from "./import-cue.mjs";

const lastTermKey = "lastImportedTerm";
const refresh = document.querySelector("#refresh");
const status = document.querySelector("#status");
const termSelect = document.querySelector("#term");
const snapshotTime = document.querySelector("#refreshed");
const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
let saved = {};
let selectedTerm;
let busy = false;
let updateForecasts = () => {};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function announce(message = "", error = false) {
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle("error", error);
}

function quantity(count, unit) {
  return `${count} ${unit}${count === 1 ? "" : unit === "class" ? "es" : "s"}`;
}

function forecastText(result, hoursPerClass) {
  switch (result.kind) {
    case "empty": return "No classes recorded";
    case "unset": return "Set a target to see your forecast.";
    case "unreachable": return "Existing absences make a 100% target unreachable.";
    case "below-target": {
      const hours = quantity(result.hours, "hour");
      if (!hoursPerClass) return `Attend ${hours} in a row to reach target.`;
      const classes = quantity(Math.ceil(result.hours / hoursPerClass), "class");
      return `Attend ${classes} in a row to reach target (${hours} needed).`;
    }
    case "on-target": return `You can bunk up to ${quantity(result.hours, "hour")} in a row.`;
  }
}

function inputField(label, mode, placeholder) {
  const field = element("label", "field", label);
  const input = element("input");
  input.inputMode = mode;
  input.placeholder = placeholder;
  input.autocomplete = "off";
  field.append(input);
  return { field, input };
}

function makeCard(counts, subject) {
  const overall = !subject;
  const name = subject?.name ?? "Overall attendance";
  const key = settingKey(selectedTerm, subject);
  const settings = saved[key] ?? {};
  const article = element("article", overall ? "card overall" : "card subject");
  const heading = element("div", "card-heading");
  const title = element("div");
  title.append(element(overall ? "h2" : "h3", "", name));
  const metadata = subject && [subject.code, subject.type].filter(Boolean).join(" · ");
  if (metadata) title.append(element("p", "meta", metadata));
  const percentage = counts.total ? counts.attended / counts.total * 100 : null;
  const value = element("span", "percentage", percentage == null ? "—" : `${percent.format(percentage)}%`);
  heading.append(title, value);

  const countLabel = element("p", "counts", `${counts.attended} / ${counts.total} hours attended`);
  const track = element("div", "track");
  track.setAttribute("aria-hidden", "true");
  const fill = element("div", "fill");
  fill.style.width = `${percentage ?? 0}%`;
  const marker = element("span", "marker");
  track.append(fill, marker);

  const resultLine = element("p", "result");
  const bunkLine = element("p", "bunk");
  const form = element("form", "settings");
  const target = inputField("Target (%)", "decimal", "Unset");
  target.input.setAttribute("aria-label", `${name} target percentage`);
  target.input.value = settings.target == null ? "" : String(settings.target / 100);
  form.append(target.field);
  let length;
  if (subject) {
    length = inputField("Hours per class", "numeric", "1");
    length.input.setAttribute("aria-label", `${name} hours per class`);
    length.input.value = String(settings.hoursPerClass ?? 1);
    form.append(length.field);
  }
  const save = element("button", "save", "Save");
  save.type = "submit";
  const feedback = element("p", "form-feedback");
  feedback.setAttribute("role", "status");
  form.append(save, feedback);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    let next;
    try {
      next = { target: parseTarget(target.input.value) };
      if (subject) next.hoursPerClass = parseClassLength(length.input.value);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add("error");
      return;
    }

    save.disabled = true;
    try {
      await chrome.storage.local.set({ [key]: next });
      saved[key] = next;
      updateForecasts();
      feedback.textContent = "Saved";
      feedback.classList.remove("error");
    } catch {
      feedback.textContent = "Couldn’t save settings. Try again.";
      feedback.classList.add("error");
    } finally {
      save.disabled = false;
    }
  });

  article.append(heading, countLabel, track, resultLine);
  if (subject) article.append(bunkLine);
  article.append(form);

  function renderForecast(overallResult) {
    const { target: goal, hoursPerClass = 1 } = saved[key] ?? {};
    const result = forecast(counts, goal);
    marker.hidden = goal == null;
    if (goal != null) marker.style.left = `${goal / 100}%`;
    article.classList.toggle("below", result.kind === "below-target" || result.kind === "unreachable");
    if (overall || result.kind !== "on-target") {
      resultLine.textContent = forecastText(result, subject ? hoursPerClass : undefined);
    } else {
      resultLine.textContent = "Subject target met";
    }
    if (subject) {
      const allowance = bunkAllowance(result, overallResult, hoursPerClass);
      const missingTarget = result.kind !== "empty" && overallResult.kind !== "empty" &&
        (result.kind === "unset" || overallResult.kind === "unset");
      bunkLine.hidden = !allowance && !missingTarget;
      bunkLine.textContent = allowance
        ? `Can bunk ${quantity(allowance.classes, "class")} (${quantity(allowance.hours, "hour")} available)`
        : "Set both targets to see your bunk allowance.";
    }
    return result;
  }

  return { article, renderForecast };
}

function render() {
  const terms = Object.values(saved).filter((value) => value?.importedAt && value?.termId)
    .sort((a, b) => b.importedAt - a.importedAt);
  const snapshot = selectedTerm && saved[termStorageKey(selectedTerm)];
  document.querySelector("#dashboard").hidden = !snapshot;
  document.querySelector("#empty").hidden = Boolean(snapshot);
  snapshotTime.textContent = snapshot
    ? `Refreshed ${new Date(snapshot.importedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
    : "No attendance imported";
  if (!snapshot) return;

  const options = terms.map(({ termName, termId }) => {
    const option = element("option", "", termName);
    option.value = termId;
    return option;
  });
  termSelect.replaceChildren(...options);
  termSelect.value = selectedTerm;
  const overall = makeCard(snapshot.overall, null);
  const subjects = snapshot.subjects.map((row) => makeCard(row, row));
  document.querySelector("#overall").replaceChildren(overall.article);
  document.querySelector("#subjects").replaceChildren(...subjects.map((card) => card.article));
  if (!subjects.length) {
    document.querySelector("#subjects").append(element("p", "meta", "No course rows for this semester."));
  }
  updateForecasts = () => {
    const overallResult = overall.renderForecast();
    subjects.forEach((card) => card.renderForecast(overallResult));
  };
  updateForecasts();
}

termSelect.addEventListener("change", () => {
  if (busy) return;
  selectedTerm = termSelect.value;
  announce();
  render();
});

refresh.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  refresh.disabled = true;
  termSelect.disabled = true;
  refresh.textContent = "Refreshing…";
  announce();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isAttendanceUrl(tab?.url)) {
      throw new Error("Open CUE Attendance in the active tab and sign in, then try again.");
    }
    let runs;
    try {
      runs = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readCueAttendance,
      });
    } catch {
      throw new Error("Couldn’t read the active tab. Open the CUE attendance page and reopen the extension.");
    }
    const result = runs[0]?.result;
    if (!result?.snapshot) {
      throw new Error(result?.error || "Couldn’t read attendance. Wait for CUE to load and try again.");
    }
    const snapshot = { ...result.snapshot, importedAt: Date.now() };
    const identities = new Set(snapshot.subjects.map(subjectKey));
    if (identities.size !== snapshot.subjects.length) {
      throw new Error("CUE returned duplicate course rows. Check Course Overview and try again.");
    }

    const changes = {
      [termStorageKey(snapshot.termId)]: snapshot,
      [lastTermKey]: snapshot.termId,
    };
    try {
      await chrome.storage.local.set(changes);
    } catch {
      throw new Error("Couldn’t save the refreshed attendance. Try again.");
    }
    Object.assign(saved, changes);
    selectedTerm = snapshot.termId;
    render();
    announce(`Updated ${snapshot.termName}.`);
  } catch (error) {
    announce(error.message, true);
  } finally {
    busy = false;
    refresh.disabled = false;
    refresh.textContent = "Refresh from CUE";
    termSelect.disabled = false;
  }
});

try {
  saved = await chrome.storage.local.get(null);
  selectedTerm = saved[lastTermKey];
  render();
  refresh.disabled = false;
} catch {
  announce("Couldn’t open saved attendance. Close and reopen the extension.", true);
}
