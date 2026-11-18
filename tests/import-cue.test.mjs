import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { CUE_URL, isAttendanceUrl, readCueAttendance } from "../import-cue.mjs";

const courses = [
  ["Applied Machine Intelligence", "MCA524-5", "Theory", 52, 57],
  ["DevOps", "MCA523-5", "Theory", 59, 59],
  ["Digital Forensics", "MCA509C-5", "Theory", 30, 32],
  ["UI/UX Design", "MCA523C-5", "Practical", 30, 34],
  ["Extracurricular", "null", "", 13, 13],
];

function node({ attrs = {}, selectors = {}, text = "", hidden = false, ...extra } = {}) {
  return {
    getAttribute: (key) => attrs[key] ?? null,
    getClientRects: () => hidden ? [] : [1],
    querySelectorAll: (key) => selectors[key] ?? [],
    querySelector: (key) => selectors[key]?.[0] ?? null,
    innerText: text,
    textContent: text,
    ...extra,
  };
}

function fixture({ rows = courses, loading = false, table = false, term = "V", total = "184 / 195 hrs", overview = true } = {}) {
  const courseCards = rows.map(([name, code, type, a, b]) => node({
    attrs: { "aria-label": `${name} (${code}): 100% attendance, ${a} of ${b} classes attended.` },
    selectors: { '[role="heading"][aria-level="3"], h3': [
      node({ text: name, nextElementSibling: node({ text: code + (type ? ` • ${type}` : "") }) }),
    ] },
  }));
  const tableRows = rows.map(([name, code, type, a, b]) => node({
    selectors: { 'th[scope="row"]': [node({
      text: name,
      children: [node({ text: name }), node({ text: code })],
      selectors: { ".MuiChip-label": [node({ text: type || "N/A" })] },
    })] },
    cells: [node(), node({ text: `${a} / ${b}` })],
  }));
  tableRows.push(node({ selectors: { 'th[scope="row"]': [node({ text: "↳ Theory" })] } }));
  return node({
    getElementById: (key) => key === "term-label" ? node({ text: "Semester" }) : null,
    selectors: {
      '[aria-label="Loading"], [aria-busy="true"], .MuiBackdrop-root .MuiCircularProgress-root':
        loading ? [node()] : [],
      '[role="combobox"][aria-labelledby], select': [node({
        attrs: { "aria-labelledby": "term-label term-select" },
        text: `TRIMESTER -${term}`,
        parentElement: node({ selectors: { input: [{ value: term }] } }),
      })],
      '[aria-label^="Overall attendance:" i]': [
        node({ hidden: true, text: "999 / 999 hrs" }),
        node({ text: total, attrs: {
          "aria-label": total ? "Overall attendance: percentage" : "Overall attendance: no classes allotted",
        } }),
      ],
      "#overview-panel": overview ? [node({ selectors: {
        '[role="button"][aria-label*="classes attended"]': courseCards,
        'table[aria-label="coursewise attendance table" i]': table ? [
          node({ selectors: { "tbody tr": tableRows } }),
        ] : [],
      } })] : [],
    },
  });
}

function runImport(document, url = CUE_URL) {
  const result = runInNewContext(`(${readCueAttendance})()`, {
    document, location: new URL(url), getComputedStyle: () => ({ visibility: "visible" }),
  });
  return JSON.parse(JSON.stringify(result));
}

test("imports grid and table markup with matching subject identities and exact counts", () => {
  const { snapshot } = runImport(fixture());
  assert.equal(snapshot.termName, "TRIMESTER -V");
  assert.deepEqual(snapshot.overall, { attended: 184, total: 195 });
  assert.equal(snapshot.subjects.length, 5);
  assert.deepEqual(snapshot.subjects[3], {
    name: "UI/UX Design", code: "MCA523C-5", type: "Practical", attended: 30, total: 34,
  });
  assert.equal(snapshot.subjects[4].code, "");
  const table = runImport(fixture({ term: "IV", table: true })).snapshot;
  assert.equal(table.termId, "IV");
  assert.deepEqual(table.subjects, snapshot.subjects);
});

test("rejects partial imports, loading, wrong routes and absent overview", () => {
  assert.match(runImport(fixture({ rows: courses.slice(0, 4) })).error, /incomplete/);
  assert.match(runImport(fixture({ loading: true })).error, /loading/);
  assert.match(runImport(fixture({ overview: false })).error, /Course Overview/);
  assert.match(runImport(fixture(), "https://example.org/main/attendence").error, /sign in/);
  assert.equal(isAttendanceUrl(CUE_URL + "?term=V"), true);
  assert.equal(isAttendanceUrl("https://example.org/main/attendence"), false);
  assert.equal(isAttendanceUrl(CUE_URL + "/other"), false);
});

test("imports an explicitly empty term without projecting attendance", () => {
  const { snapshot } = runImport(fixture({ rows: [], total: "" }));
  assert.deepEqual(snapshot.overall, { attended: 0, total: 0 });
  assert.deepEqual(snapshot.subjects, []);
});
