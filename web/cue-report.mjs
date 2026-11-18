const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 30;
const MAX_HOURS = 1_000_000;

export async function readCueReport(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Choose a CUE report under 15 MB.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes("%PDF-")) {
    throw new Error("Choose the PDF from CUE’s Download Report button.");
  }

  let pdfjs;
  try {
    pdfjs = await import("./pdfjs.min.mjs");
  } catch {
    throw new Error("The PDF reader couldn’t load. Refresh the page and try again.");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./pdfjs.worker.min.mjs", import.meta.url).href;
  const task = pdfjs.getDocument({ data, stopAtErrors: true, useWasm: false, enableXfa: false });
  let pages;
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PAGES) throw new Error("Choose a CUE report with 30 pages or fewer.");
    pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      pages.push((await page.getTextContent()).items);
      page.cleanup();
    }
  } catch (error) {
    if (error.name === "PasswordException") {
      throw new Error("The PDF is password-protected. Download a fresh report from CUE.");
    }
    if (error.message === "Choose a CUE report with 30 pages or fewer.") throw error;
    throw new Error("The PDF couldn’t be read. Download a fresh copy from CUE and try again.");
  } finally {
    await task.destroy();
  }
  return parseReportPages(pages);
}

function normalize(value) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function matchName(value) {
  return normalize(value).toLowerCase();
}

function groupLines(items) {
  const sorted = items.filter((item) => item.str?.trim() && item.transform)
    .map((item) => ({ text: normalize(item.str), x: item.transform[4], y: item.transform[5],
      width: item.width, height: item.height }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && line[0].y - item.y <= 2) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

function cellsOnLine(line) {
  const cells = [];
  for (const item of line) {
    const right = item.x + item.width;
    const last = cells.at(-1);
    if (last && item.x - last.right <= Math.max(3, item.height * 0.65)) {
      const space = item.x - last.right > Math.max(0.6, item.height * 0.08) ? " " : "";
      last.text += space + item.text;
      last.right = Math.max(last.right, right);
    } else {
      cells.push({ x: item.x, right, text: item.text });
    }
  }
  return cells;
}

function headerRole(value) {
  const text = normalize(value).toLowerCase().replace(/[^a-z/ ]/g, "").replace(/\s+/g, " ").trim();
  if (/^(?:sl\s*no|s\s*no|serial number)$/.test(text)) return "serial";
  if (/^(?:course|subject)(?: name| title| description)?$/.test(text)) return "name";
  if (/^(?:attendance |course |subject )?type$/.test(text)) return "type";
  if (/^(?:present|attended)(?: (?:hours|hrs|classes))?$/.test(text)) return "attended";
  if (/^(?:(?:total )?(?:hours|hrs|classes) )?(?:conducted|scheduled|held)$/.test(text)) return "total";
  if (text === "absent") return "absent";
  return null;
}

function headerFor(cells) {
  const roles = cells.map(({ text }) => headerRole(text));
  if (!["name", "attended", "total", "absent"].every((role) => roles.includes(role))) return null;
  const recognized = roles.filter(Boolean);
  return new Set(recognized).size === recognized.length ? { cells, roles } : null;
}

function readColumns(line, header) {
  const columns = header.cells.map(() => []);
  for (const item of line) {
    const center = item.x + item.width / 2;
    const column = header.cells.findIndex((cell, index) => {
      const next = header.cells[index + 1];
      if (!next) return true;
      const boundary = (cell.right + next.x) / 2;
      return center < boundary || (header.roles[index] === "name" && item.x < boundary && item.width > 40);
    });
    columns[column].push(item);
  }
  return Object.fromEntries(header.roles.flatMap((role, index) => role
    ? [[role, cellsOnLine(columns[index]).map((cell) => cell.text).join(" ")]]
    : []));
}

function hours(value) {
  const match = /^(\d+)(?:\.0+)?(?:\s*(?:hrs?|hours?))?$/i.exec(value?.trim() ?? "");
  const number = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(number) && number <= MAX_HOURS ? number : null;
}

export function parseReportPages(pages) {
  const rows = [];
  let header;
  let candidate;
  let expected;
  for (const items of pages) {
    for (const line of groupLines(items)) {
      const cells = cellsOnLine(line);
      const nextHeader = headerFor(cells);
      if (nextHeader) {
        header = nextHeader;
        candidate = null;
        continue;
      }
      if (!header) continue;
      const values = readColumns(line, header);
      const name = normalize(values.name ?? "");
      const isTotal = cells.some(({ text }) => /^(?:grand |overall )?total$/i.test(text));
      const isNumbered = /^\d+[.)]?$/.test(values.serial ?? "");
      if (isTotal || isNumbered || values.attended || values.total || values.absent) {
        const attended = hours(values.attended);
        const total = hours(values.total);
        const absent = hours(values.absent);
        if ([attended, total, absent].includes(null) || attended + absent !== total) {
          throw new Error("A row in the PDF has missing or inconsistent attendance counts. Download a fresh report from CUE.");
        }
        if (isTotal) {
          if (expected) throw new Error("Choose a report for one semester at a time.");
          expected = { attended, total };
          candidate = null;
          header = null;
          continue;
        }

        const continuation = candidate && line[0].y < candidate.y && candidate.y - line[0].y < 18;
        const combinedName = [continuation ? candidate.name : "", name].filter(Boolean).join(" ");
        candidate = null;
        if (!combinedName || combinedName.length > 120) {
          throw new Error("A course name could not be read. Download a fresh report from CUE.");
        }
        rows.push({ name: combinedName, attended, total, type: values.type ?? "" });
      } else if (name && /^\p{L}[\p{L}\p{N} &'().,/–-]*$/u.test(name)) {
        candidate = { name, y: line[0].y };
      } else {
        candidate = null;
      }
    }
    candidate = null;
  }

  if (!rows.length) {
    throw new Error("No course attendance table was found. Use the original PDF from CUE’s Download Report button.");
  }
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const attended = rows.reduce((sum, row) => sum + row.attended, 0);
  if (!expected || expected.attended !== attended || expected.total !== total) {
    throw new Error("The course rows don’t match the report totals. Download a fresh report from CUE.");
  }
  const subjects = new Map();
  for (const { name, attended, total, type } of rows) {
    const key = matchName(name);
    const typeKey = matchName(type);
    const subject = subjects.get(key);
    if (!subject) {
      subjects.set(key, { name, attended, total, types: new Set([typeKey]) });
    } else {
      if (!typeKey || subject.types.has("") || subject.types.has(typeKey)) {
        throw new Error("The report repeats a subject without distinct attendance types.");
      }
      subject.attended += attended;
      subject.total += total;
      subject.types.add(typeKey);
    }
  }
  return [...subjects.values()].map(({ name, attended, total }) => ({ name, attended, total }));
}

export function attendanceCsv(rows) {
  const content = rows.map(({ name, attended, total }) => {
    // Prevent spreadsheet apps from treating a subject name as a formula.
    const safeName = /^[=+\-@\t\r\n]/.test(name) ? "'" + name : name;
    return ['"' + safeName.replaceAll('"', '""') + '"', attended, total].join(",");
  });
  return ["Subject,Attended hours,Total hours", ...content, ""].join("\r\n");
}
