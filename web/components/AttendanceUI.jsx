import { useEffect, useState } from "react";
import { bunkAllowance, forecast } from "../calculations.mjs";

const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function percentText(value) {
  return value == null ? "—" : `${percent.format(value)}%`;
}

export function valueOf(counts) {
  return counts.total ? counts.attended / counts.total * 100 : null;
}

export function qty(value, unit) {
  return `${value.toLocaleString()} ${unit}${value === 1 ? "" : unit === "class" ? "es" : "s"}`;
}

export function recoveryText(result, length) {
  if (result.kind === "unreachable") return "Existing absences make a 100% target unreachable.";
  if (result.kind !== "below-target") return null;
  return length
    ? `Attend ${qty(Math.ceil(result.hours / length), "class")} in a row (${qty(result.hours, "hour")} needed).`
    : `Attend ${qty(result.hours, "hour")} in a row to reach target.`;
}

export function forecastText(result) {
  if (result.kind === "on-target") return `Can bunk up to ${qty(result.hours, "hour")} in a row overall.`;
  if (result.kind === "empty") return "No classes recorded";
  if (result.kind === "unset") return "Set a target to see your forecast.";
  return recoveryText(result);
}

export function Ruler({ value, goal }) {
  const color = value != null && value < 75 ? "fill-red" : value != null && value < 85 ? "fill-yellow" : "";
  return <div className={`ruler ${color} ${goal == null ? "" : "has-goal"}`}
    style={{ "--goal": `${(goal ?? 0) / 100}%` }} aria-hidden="true">
    <div className="fill" style={{ width: `${value ?? 0}%` }} />
    {goal != null && <><span className="marker" /><span className="marker-label">{percentText(goal / 100)}</span></>}
  </div>;
}

export function Overview({ subjects, counts, target, onTarget, projected = false }) {
  const value = valueOf(counts);
  const result = forecast(counts, target);
  const display = projected && value != null ? `${value.toFixed(2)}%` : percentText(value);
  const targetLabel = target == null ? "Target unset" : `${percentText(target / 100)} target`;
  return <section className="overview" aria-label={projected ? "Projected overall attendance" : "Overall attendance"}>
    <div className="overview-heading">
      <div><h2>{projected ? "Projected after claim approval" : "Overall attendance"}</h2><div className="hero-value">{display}</div></div>
      {projected ? <p className="target claims-target">{targetLabel}</p>
        : <button className="target" onClick={onTarget}>{target == null ? "Set overall target" : `${targetLabel} · Edit`}</button>}
    </div>
    <Ruler value={value} goal={target} />
    <div className="overview-foot">
      <p id={projected ? "claims-counts" : "overall-counts"}>{counts.total || projected ? `${counts.attended} of ${counts.total} hours attended` : "0 hours recorded"}</p>
      <p id={projected ? "claims-forecast" : "overall-forecast"}>{subjects.length ? forecastText(result) : "Add your subjects to start tracking."}</p>
    </div>
  </section>;
}

export function SubjectCard({ subject, overall, onEdit, onLog, projected = false }) {
  const [feedback, setFeedback] = useState(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);
  const result = forecast(subject, subject.target);
  const recovery = recoveryText(result, subject.length);
  const allowance = bunkAllowance(result, overall, subject.length);
  function record(outcome) {
    if (onLog(subject, outcome)) setFeedback({ outcome, savedAt: Date.now() });
  }
  return <article className={`subject${feedback ? " class-updated" : ""}`}>
    <div className="card-heading">
      <div>
        <h3>{subject.name}</h3>
        <p className="muted">{subject.target == null ? "Target unset" : `${percentText(subject.target / 100)} target · ${qty(subject.length, "hour")} per class`}</p>
        <strong className={recovery ? "score warning" : "score"}>{percentText(valueOf(subject))}</strong>
      </div>
      {!projected && <button className="edit" onClick={() => onEdit(subject)}>Edit</button>}
    </div>
    <Ruler value={valueOf(subject)} goal={subject.target} />
    <p className="muted">{subject.attended} of {subject.total} hours attended</p>
    {projected && <p className="muted">Currently {subject.currentAttended} of {subject.total} hours · {qty(subject.claimHours, "pending claim hour")} · {qty(subject.total - subject.attended, "absent hour")} remaining</p>}
    <div className="projection">
      {recovery && <p className="warning">{recovery}</p>}
      {result.kind === "empty" ? <p className="muted">No classes recorded</p> : allowance
        ? <p>Can bunk {qty(allowance.classes, "class")} · {qty(allowance.hours, "hour")} available</p>
        : <p className="muted">Set both targets to see the bunk allowance.</p>}
    </div>
    {!projected && <div className="card-actions">
      <button className="log" onClick={() => record("attended")}>＋ Attended</button>
      <button className="log" onClick={() => record("missed")}>＋ Missed</button>
    </div>}
    {!projected && <p key={feedback?.savedAt ?? "idle"} role="status" className={`class-feedback${feedback?.outcome === "missed" ? " is-missed" : ""}`}>
      {feedback ? `${qty(subject.length, "hour")} marked ${feedback.outcome}.` : ""}
    </p>}
  </article>;
}
