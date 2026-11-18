export const CUE_URL = "https://cue.christuniversity.in/main/attendence";

export function isAttendanceUrl(value) {
  if (!value) return false;
  const url = new URL(value);
  return url.origin + url.pathname.replace(/\/$/, "") === CUE_URL;
}

// Chrome serializes this function into the active tab's isolated world.
// Keep it self-contained and read only the rendered attendance controls.
export function readCueAttendance() {
  try {
    return { snapshot: readPage() };
  } catch (error) {
    return { error: error.message };
  }

  function readPage() {
    if (location.origin !== "https://cue.christuniversity.in" ||
        location.pathname.replace(/\/$/, "") !== "/main/attendence") {
      throw new Error("Open the CUE attendance page and sign in, then try again.");
    }

    const clean = (value) => (value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element) => element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible";
    const find = (selector, root = document) => [...root.querySelectorAll(selector)].find(visible);
    const incomplete = () => {
      throw new Error("CUE’s overall and course counts are incomplete or don’t match. Wait for the page to finish loading and try again.");
    };
    const counts = (match) => {
      if (!match) incomplete();
      const attended = Number(match[1]);
      const total = Number(match[2]);
      if (!Number.isSafeInteger(attended) || !Number.isSafeInteger(total) || attended > total) {
        incomplete();
      }
      return { attended, total };
    };
    const course = (name, code, type, match) => {
      if (!name) incomplete();
      return {
        name,
        code: /^(null|undefined|n\/a)$/i.test(code) ? "" : code,
        type: /^n\/a$/i.test(type) ? "" : type,
        ...counts(match),
      };
    };

    if (find('[aria-label="Loading"], [aria-busy="true"], .MuiBackdrop-root .MuiCircularProgress-root')) {
      throw new Error("CUE is loading attendance. Wait for it to finish and try again.");
    }

    const main = document.querySelector("#main-content") ?? document;
    const semester = [...main.querySelectorAll('[role="combobox"][aria-labelledby], select')]
      .find((element) => visible(element) && (clean(element.labels?.[0]?.textContent) === "Semester" ||
        (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).some(
          (id) => clean(document.getElementById(id)?.textContent) === "Semester",
        )));
    const termName = clean(semester?.selectedOptions?.[0]?.textContent ?? semester?.innerText);
    if (!termName || /^select an option$/i.test(termName)) {
      throw new Error("Sign in to CUE, open Attendance, and select a semester before refreshing.");
    }
    const selectedId = semester.value ?? semester.parentElement.querySelector("input")?.value;
    const termId = clean(selectedId) || termName.toLowerCase();

    const summary = find('[aria-label^="Overall attendance:" i]', main);
    if (!summary) incomplete();
    const overallMatch = /\b(\d+)\s*\/\s*(\d+)\s*(?:hrs?\b|hours?\b)/i.exec(summary.innerText);
    const overall = /no classes allotted/i.test(summary.getAttribute("aria-label"))
      ? { attended: 0, total: 0 }
      : counts(overallMatch);

    const panel = find("#overview-panel", main);
    if (!panel) {
      throw new Error("Select Course Overview on the CUE attendance page and try again.");
    }

    const table = find('table[aria-label="coursewise attendance table" i]', panel);
    let subjects;
    if (table) {
      subjects = [...table.querySelectorAll('tbody tr')].filter((row) => {
        const heading = row.querySelector('th[scope="row"]');
        return visible(row) && heading && !clean(heading.innerText).startsWith("↳");
      }).map((row) => {
        const heading = row.querySelector('th[scope="row"]');
        return course(
          clean(heading.children[0]?.textContent),
          clean(heading.children[1]?.textContent),
          clean(heading.querySelector(".MuiChip-label")?.textContent),
          /^(\d+)\s*\/\s*(\d+)$/.exec(clean(row.cells[1]?.innerText)),
        );
      });
    } else {
      subjects = [...panel.querySelectorAll('[role="button"][aria-label*="classes attended"]')]
        .filter(visible).map((card) => {
          const heading = card.querySelector('[role="heading"][aria-level="3"], h3');
          const [code, type = ""] = clean(heading?.nextElementSibling?.textContent).split(/\s*•\s*/);
          return course(
            clean(heading?.textContent),
            code,
            type,
            /\b(\d+)\s+of\s+(\d+)\s+classes attended\b/i.exec(card.getAttribute("aria-label")),
          );
        });
    }

    // Prevent a partial result from replacing the last valid snapshot.
    const subjectTotals = subjects.reduce((sum, row) => ({
      attended: sum.attended + row.attended,
      total: sum.total + row.total,
    }), { attended: 0, total: 0 });
    if (subjectTotals.attended !== overall.attended || subjectTotals.total !== overall.total) {
      incomplete();
    }

    return { termId, termName, overall, subjects };
  }
}
