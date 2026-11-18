export function parseCueText(input) {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = [];
  let cursor = 0;
  let expected;
  for (const [index, line] of lines.entries()) {
    const overall = /\b(\d+)\s*\/\s*(\d+)\s*(?:hrs?|hours?)\b/i.exec(line);
    if (overall) {
      expected = overall.slice(1).map(Number);
      cursor = index + 1;
      continue;
    }

    const csv = /^(.+?)\s*[,\t]\s*(\d+)\s*[,\t]\s*(\d+)$/.exec(line);
    if (csv) {
      rows.push(row(csv[1], csv[2], csv[3]));
      cursor = index + 1;
      continue;
    }

    const hours = /\b(\d+)\s+of\s+(\d+)\s+(?:total\s+)?hours?\s+attended\b/i.exec(line);
    if (!hours) continue;
    const raw = [...lines.slice(cursor, index), line.slice(0, hours.index)].join(" ");
    const name = raw
      .replace(/.*\b(?:Course Overview|Daily Log|Download Report)\b/i, "")
      .replace(/\b(?:Theory|Practical|Multiple Types)\b\s*(?:[\d.]+\s*%)?\s*$/i, "")
      .replace(/\s+(?:With Co-curricular\s*)?(?:\d+(?:\.\d+)?\s*%)(?:\s+With Co-curricular)?\s*$/i, "")
      .replace(/\s*With Co-curricular\s*$/i, "")
      .replace(/\s*•\s*(?:Theory|Practical|Multiple Types)?\s*$/i, "")
      .replace(/MCA\d{2,}[A-Z]*-\d+\s*$/i, "")
      .replace(/\s+[A-Z]{2,}\d{2,}[A-Z]*-\d+\s*$/i, "")
      .trim();
    rows.push(row(name, hours[1], hours[2]));
    cursor = index + 1;
  }

  if (!rows.length) {
    throw new Error("No course rows found. Copy the Course Overview cards, or use one line per subject: Name, attended, total.");
  }
  const names = new Set(rows.map(({ name }) => name.toLowerCase()));
  if (names.size !== rows.length) {
    throw new Error("Two rows have the same subject name. Give each subject a distinct name and try again.");
  }
  if (expected) {
    const totals = sumHours(rows);
    if (totals.attended !== expected[0] || totals.total !== expected[1]) {
      throw new Error("The course hours don’t match the copied overall total. Copy all course cards and try again.");
    }
  }
  return rows;
}

function row(name, attendedText, totalText) {
  const attended = Number(attendedText);
  const total = Number(totalText);
  if (!name.trim() || name.length > 120 || !Number.isSafeInteger(total) || total > 1000000 || attended > total) {
    throw new Error("Check each subject name and its hours. Attended hours must be between zero and total hours.");
  }
  return { name: name.trim(), attended, total };
}

export function sumHours(subjects) {
  return subjects.reduce((sum, subject) => ({
    attended: sum.attended + subject.attended,
    total: sum.total + subject.total,
  }), { attended: 0, total: 0 });
}
