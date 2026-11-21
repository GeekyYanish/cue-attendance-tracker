"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { forecast, parseClassLength, parseTarget } from "../calculations.mjs";
import { parseCueText, sumHours } from "../import.mjs";
import { attendanceCsv, matchName, readCueReport } from "../cue-report.mjs";
import { projectClaims } from "../claims.mjs";
import { commitModel, emptyModel, loadModel } from "../storage.mjs";
import { log, track } from "../analytics.mjs";
import { Overview, SubjectCard, percentText, qty, valueOf } from "./AttendanceUI";
import FormDialog, { Field } from "./FormDialog";
import Feedback from "./Feedback";
import Portfolio from "./Portfolio";

function currentTerm(model) {
  return model.terms.find((term) => term.id === model.active);
}

function readInteger(value) {
  const text = value.trim();
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number > 1000000) {
    throw new Error("Enter whole hours between 0 and 1,000,000.");
  }
  return number;
}

export default function Tracker({ view }) {
  const router = useRouter();
  const [model, setModel] = useState(emptyModel);
  const modelRef = useRef(model);
  const [ready, setReady] = useState(false);
  const [editor, setEditor] = useState(null);
  const editorId = useRef(0);
  const [status, setStatus] = useState(null);
  const [mobile, setMobile] = useState(false);
  const lastView = useRef(null);
  const active = currentTerm(model);
  const counts = sumHours(active.subjects);
  const overall = forecast(counts, active.target);
  const claimsView = view === "claims";

  useEffect(() => {
    try {
      const saved = loadModel(localStorage);
      modelRef.current = saved;
      setModel(saved);
    } catch {
      setStatus({ message: "Saved attendance couldn’t be read in this browser." });
    }
    setReady(true);
    const media = matchMedia("(max-width: 660px)");
    const resize = () => setMobile(media.matches);
    resize();
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);

  useEffect(() => {
    const legacyHash = () => {
      if (location.hash === "#claims" && !claimsView) router.replace("/claims/");
      if (location.hash === "#attendance" && claimsView) router.replace("/");
    };
    legacyHash();
    window.addEventListener("hashchange", legacyHash);
    if (lastView.current !== view) {
      lastView.current = view;
      track("$pageview");
    }
    return () => window.removeEventListener("hashchange", legacyHash);
  }, [view, claimsView, router]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 5500);
    return () => clearTimeout(timer);
  }, [status]);

  function notify(message) { setStatus({ message }); }
  function save(change) {
    const next = commitModel(modelRef.current, change, localStorage);
    modelRef.current = next;
    setModel(next);
  }
  function open(config) { setEditor({ ...config, id: ++editorId.current }); }
  function close(message) {
    setEditor(null);
    if (message) notify(message);
  }
  function confirm(title, message, accept, action) {
    open({ title, fields: <p className="muted">{message}</p>, accept, destructive: true, submit: action });
  }
  function setTarget() {
    const before = currentTerm(modelRef.current).target;
    open({
      title: "Overall target", accept: "Save target",
      fields: <Field title="Target (%)" name="target" value={before == null ? "" : before / 100} mode="decimal" placeholder="Leave blank to clear" />,
      submit(data) {
        const target = parseTarget(data.get("target"));
        save((next) => { currentTerm(next).target = target; });
        if (target != null && target !== before) track("attendance_target_saved", { scope: "overall" });
        return target == null ? "Overall target cleared." : "Overall target saved.";
      },
    });
  }
  function editSubject(subject) {
    open({
      title: subject ? "Edit subject" : "Add subject", accept: subject ? "Save changes" : "Add subject",
      fields: <>
        <Field title="Subject name" name="name" value={subject?.name} required maxLength={120} />
        <Field title="Hours attended" name="attended" value={subject?.attended ?? 0} required mode="numeric" />
        <Field title="Total hours held" name="total" value={subject?.total ?? 0} required mode="numeric" />
        <Field title="Subject target (%)" name="target" value={subject?.target == null ? "" : subject.target / 100} mode="decimal" placeholder="Optional" />
        <Field title="Hours per class" name="length" value={subject?.length ?? 1} required mode="numeric" />
        {subject && <button type="button" className="remove" onClick={() => confirm("Remove subject",
          `Remove ${subject.name} and its attendance from this semester?`, "Remove subject", () => {
            save((next) => { currentTerm(next).subjects = currentTerm(next).subjects.filter((row) => row.id !== subject.id); });
            track("subject_removed");
            return "Subject removed.";
          })}>Remove subject</button>}
      </>,
      submit(data) {
        const name = data.get("name").trim();
        if (!name) throw new Error("Enter a subject name.");
        const attended = readInteger(data.get("attended"));
        const total = readInteger(data.get("total"));
        if (attended > total) throw new Error("Attended hours can’t exceed total hours held.");
        const length = parseClassLength(data.get("length"));
        if (length > 1000000) throw new Error("Hours per class must be at most 1,000,000.");
        const target = parseTarget(data.get("target"));
        save((next) => {
          const { subjects } = currentTerm(next);
          if (subjects.some((row) => row.id !== subject?.id && matchName(row.name) === matchName(name))) {
            throw new Error("A subject with that name already exists in this semester.");
          }
          const row = { ...subject, id: subject?.id ?? crypto.randomUUID(), name, attended, total, length, target };
          if (subject) subjects[subjects.findIndex((item) => item.id === subject.id)] = row;
          else subjects.push(row);
        });
        track("subject_saved", { action: subject ? "updated" : "created" });
        if (target != null && target !== subject?.target) track("attendance_target_saved", { scope: "subject" });
        return subject ? "Subject updated." : "Subject added.";
      },
    });
  }
  function newSemester() {
    open({
      title: "New semester", accept: "Create semester",
      fields: <Field title="Semester name" name="name" required maxLength={80} />,
      submit(data) {
        const name = data.get("name").trim();
        save((next) => {
          if (!name || next.terms.some((term) => matchName(term.name) === matchName(name))) throw new Error("Enter a unique semester name.");
          next.active = crypto.randomUUID();
          next.terms.push({ id: next.active, name, target: null, subjects: [] });
        });
        track("semester_created");
        return "Semester created.";
      },
    });
  }
  function deleteSemester() {
    const term = currentTerm(modelRef.current);
    confirm("Delete semester", `Delete “${term.name}” and all of its subjects, attendance, and targets? This action is permanent.`, "Delete semester", () => {
      save((next) => {
        const index = next.terms.findIndex((item) => item.id === term.id);
        next.terms.splice(index, 1);
        if (!next.terms.length) next.terms.push({ id: crypto.randomUUID(), name: "Current semester", target: null, subjects: [] });
        next.active = next.terms[Math.min(index, next.terms.length - 1)].id;
      });
      track("semester_deleted");
      return "Semester deleted.";
    });
  }
  function record(subject, outcome) {
    try {
      save((next) => {
        const row = currentTerm(next).subjects.find((item) => item.id === subject.id);
        if (row.total + row.length > 1000000) throw new Error("The subject has reached the maximum recorded hours.");
        row.total += row.length;
        if (outcome === "attended") row.attended += row.length;
      });
      track("class_logged", { outcome });
      return true;
    } catch (error) {
      notify(error.message);
      return false;
    }
  }
  function downloadCsv(rows, method) {
    const url = URL.createObjectURL(new Blob([attendanceCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "cue-attendance.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    track("attendance_csv_downloaded", { source: method });
    log("attendance_csv_downloaded", { source: method, subject_count: rows.length });
  }
  function reviewImport(rows, fileName, semesterId) {
    const term = currentTerm(modelRef.current);
    if (term.id !== semesterId) throw new Error("The selected semester changed. Import the report again.");
    const totals = sumHours(rows);
    const method = fileName ? "pdf" : "paste";
    open({
      title: "Review import", accept: "Save import",
      fields: <>
        <p className="muted">Import into {term.name} · {totals.attended} of {totals.total} hours</p>
        {fileName && <p className="muted report-name">{fileName}</p>}
        <ul className="import-list">{rows.map((row) => {
          const existing = term.subjects.find((item) => matchName(item.name) === matchName(row.name));
          return <li key={row.name}>{row.name} · {existing ? `${existing.attended} / ${existing.total} → ` : ""}
            {row.attended} / {row.total} hours{existing ? "" : " · New subject"}</li>;
        })}</ul>
        <p className="muted">Saving replaces the hours for matching subjects and keeps their targets and class lengths. Subjects absent from the file stay as they are.</p>
        <button type="button" className="secondary csv-download" onClick={() => downloadCsv(rows, method)}>Download CSV</button>
      </>,
      submit() {
        const clearedClaims = Boolean(currentTerm(modelRef.current).claims);
        save((next) => {
          const term = currentTerm(next);
          if (term.id !== semesterId) throw new Error("The selected semester changed. Import the report again.");
          for (const row of rows) {
            const existing = term.subjects.find((item) => matchName(item.name) === matchName(row.name));
            if (existing) Object.assign(existing, { attended: row.attended, total: row.total });
            else term.subjects.push({ ...row, id: crypto.randomUUID(), length: 1, target: null });
          }
          delete term.claims;
        });
        track("attendance_imported", { method });
        log("attendance_import_completed", { method, subject_count: rows.length });
        return `Imported ${rows.length} ${rows.length === 1 ? "subject" : "subjects"}.${clearedClaims ? " Saved claims cleared. Enter any claims still awaiting credit on Claims projection." : ""}`;
      },
    });
  }
  function importAttendance() {
    const semesterId = modelRef.current.active;
    open({
      title: "Import from CUE", accept: "Review import",
      fields: <>
        <p className="muted">In CUE, choose Attendance → Course Overview → Download Report. Select the PDF below to convert it to CSV in your browser.</p>
        <label className="field">Attendance report (PDF)<input name="report" type="file" accept=".pdf,application/pdf" /></label>
        <details className="import-fallback"><summary>Paste attendance instead</summary>
          <Field title="Attendance text" name="text" multiline placeholder="Paste CUE course cards or enter Subject name, 18, 20" /></details>
      </>,
      async submit(data, stillCurrent) {
        const file = data.get("report");
        const pasted = data.get("text").trim();
        if (file.size && pasted) throw new Error("Choose a PDF or paste attendance text, then try again.");
        if (!file.size && !pasted) throw new Error("Select a CUE PDF report or paste attendance text.");
        const rows = file.size ? await readCueReport(file) : parseCueText(pasted);
        if (stillCurrent()) reviewImport(rows, file.size ? file.name : null, semesterId);
      },
    });
  }
  function editClaims() {
    const term = currentTerm(modelRef.current);
    if (!term.subjects.length) { notify("Add or import your current attendance for this semester first."); return; }
    const entries = term.claims?.source === "manual" ? term.claims.entries : [];
    open({
      title: "Pending co-curricular claims", accept: "Save claims",
      fields: <>
        <p className="muted">Pending claims for {term.name}. Enter whole hours that CUE has yet to credit. Use 0 for subjects without pending claims.</p>
        {term.subjects.map((subject, index) => <Field key={subject.id}
          title={`${subject.name} · Pending claim hours (${subject.total - subject.attended} absent hours recorded)`}
          name={`claim-${index}`} required mode="numeric"
          value={entries.filter((entry) => entry.subjectId === subject.id).reduce((sum, entry) => sum + entry.hours, 0)} />)}
      </>,
      submit(data) {
        const pending = term.subjects.map((subject, index) => ({
          subjectId: subject.id, hours: readInteger(data.get(`claim-${index}`)),
        })).filter((entry) => entry.hours > 0);
        save((next) => {
          const active = currentTerm(next);
          if (active.id !== term.id) throw new Error("The selected semester changed. Open pending claims again.");
          projectClaims(active.subjects, pending);
          active.claims = { source: "manual", updatedAt: new Date().toISOString(), entries: pending };
        });
        return "Pending claims projection updated.";
      },
    });
  }
  function clearClaims() {
    confirm("Clear claims", `Clear the claims projection for ${active.name}? You can enter pending claims again.`, "Clear claims", () => {
      save((next) => { delete currentTerm(next).claims; });
      return "Claims cleared.";
    });
  }

  return <>
    <header className="bar"><div className="wrap brand">
      <span className="brand-name"><span className="mark" aria-hidden="true"><i /><i /><i /></span>CUE Attendance</span>
      <Feedback />{mobile && <Portfolio />}
    </div></header>
    <main className="wrap" aria-busy={!ready}>
      <div className="page-heading"><div><h1>Attendance tracker</h1><p>Track your hours and see how many classes you can miss.</p></div>
        {!claimsView && <button className="secondary" onClick={importAttendance} disabled={!ready}>Import from CUE</button>}</div>
      <nav className="screen-nav" aria-label="Attendance views">
        <Link href="/" aria-current={!claimsView ? "page" : undefined}>Attendance</Link>
        <Link href="/claims/" aria-current={claimsView ? "page" : undefined}>Claims projection</Link>
      </nav>
      {!ready ? <p role="status" className="muted">Loading saved attendance…</p> : <>
        <div className="term-controls">
          <label htmlFor="term">Semester</label>
          <select id="term" value={model.active} onChange={(event) => {
            const id = event.target.value;
            try { save((next) => { next.active = id; }); } catch (error) { notify(error.message); }
          }}>{model.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select>
          <div className="term-actions"><button className="secondary" onClick={newSemester}>＋ New semester</button>
            <button className="secondary danger-outline" onClick={deleteSemester}>Delete semester</button></div>
        </div>
        {claimsView ? <ClaimsScreen term={active} onEdit={editClaims} onClear={clearClaims} /> : <>
          <Overview subjects={active.subjects} counts={counts} target={active.target} onTarget={setTarget} />
          <section aria-labelledby="subjects-title">
            <div className="section-heading"><div><h2 id="subjects-title">Subjects <span id="subject-count">{active.subjects.length}</span></h2>
              {!!active.subjects.length && <p>Each bunk allowance assumes all missed classes are in that subject.</p>}</div>
              <button className="primary" onClick={() => editSubject()}>＋ Add subject</button></div>
            <div className="subject-grid">{active.subjects.map((subject) =>
              <SubjectCard key={subject.id} subject={subject} overall={overall} onEdit={editSubject} onLog={record} />)}</div>
            {!active.subjects.length && <div className="empty"><h3>No subjects yet</h3>
              <p>Import your current attendance from CUE or add a subject and enter your hours.</p>
              <button className="secondary" onClick={importAttendance}>Import from CUE</button></div>}
          </section>
        </>}
      </>}
      {!mobile && <footer><Portfolio /></footer>}
      <p role="status" className="notice" hidden={!status}>{status?.message}</p>
    </main>
    {editor && <FormDialog key={editor.id} config={editor} onClose={close} />}
  </>;
}

function ClaimsScreen({ term, onEdit, onClear }) {
  const dataset = term.claims?.source === "manual" ? term.claims : null;
  let subjects = [];
  let error;
  if (dataset) {
    try { subjects = projectClaims(term.subjects, dataset.entries); }
    catch (failure) { error = failure.message; }
  }
  const current = sumHours(term.subjects);
  const projected = sumHours(subjects);
  const overall = forecast(projected, term.target);
  const stats = [
    ["Current attendance", percentText(valueOf(current))], ["Current attended hours", current.attended],
    ["Total hours held", current.total], ["Pending claim hours", projected.attended - current.attended],
    ["Projected attended hours", projected.attended], ["Remaining absent hours", projected.total - projected.attended],
  ];
  return <section id="claims-screen" aria-labelledby="claims-title">
    <div className="section-heading"><div><h2 id="claims-title">Claims projection</h2>
      <p>Preview attendance after your pending co-curricular claims are approved. Enter hours still awaiting credit in CUE.</p></div>
      <button className="primary" onClick={onEdit}>{dataset ? "Edit pending claims" : "Add pending claims"}</button></div>
    <div className="claims-toolbar"><p className="muted">{dataset ? `Last saved · ${new Date(dataset.updatedAt).toLocaleString()}`
      : term.claims ? "Previous CSV claims have been excluded. Enter only claim hours still awaiting credit in CUE."
        : "No pending claims entered for this semester."}</p>
      {term.claims && <button className="secondary" onClick={onClear}>Clear claims</button>}</div>
    {error && <p className="claims-error" role="alert">{error}</p>}
    {!dataset && <div className="empty"><h3>See your attendance after claims</h3>
      <p>Add your current attendance to this semester, then enter pending claim hours for each subject. CUE’s co-curricular CSV shows hours already credited to your attendance.</p></div>}
    {dataset && !error && <>
      <Overview subjects={subjects} counts={projected} target={term.target} projected />
      <dl className="claims-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="section-heading"><div><h2>Subjects</h2><p>Each bunk allowance assumes all upcoming missed hours are in that subject.</p></div></div>
      <div className="subject-grid">{subjects.map((subject) => <SubjectCard key={subject.id} subject={subject} overall={overall} projected />)}</div>
    </>}
  </section>;
}
