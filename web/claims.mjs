export function projectClaims(subjects, entries = []) {
  const hoursBySubject = new Map();
  for (const entry of entries) {
    if (!subjects.some((subject) => subject.id === entry.subjectId)) {
      throw new Error("A claimed subject is missing. Edit pending claims and save them again.");
    }
    if (!Number.isSafeInteger(entry.hours) || entry.hours < 1) throw new Error("Saved claim hours are invalid. Edit pending claims and save them again.");
    hoursBySubject.set(entry.subjectId, (hoursBySubject.get(entry.subjectId) ?? 0) + entry.hours);
  }
  return subjects.map((subject) => {
    const claimHours = hoursBySubject.get(subject.id) ?? 0;
    if (claimHours > subject.total - subject.attended) {
      throw new Error(`Claims for ${subject.name} exceed its recorded absent hours. Check attendance and edit the pending claim hours.`);
    }
    return { ...subject, currentAttended: subject.attended, attended: subject.attended + claimHours, claimHours };
  });
}
