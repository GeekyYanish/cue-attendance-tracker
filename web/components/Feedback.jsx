"use client";

import { useEffect, useRef, useState } from "react";
import { log, track } from "../analytics.mjs";

const invitationKey = "cue-feedback-invitation-dismissed";
const liveHost = "https://attendance-tracker.yanish.me";
const feedbackHosts = new Set(["attendance-tracker.yanish.me", "cue-attendance-tracker.netlify.app"]);

export default function Feedback() {
  const [invitation, setInvitation] = useState(false);
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const dialog = useRef(null);
  const thanks = useRef(null);
  const trigger = useRef(null);
  const busy = useRef(false);
  const request = useRef(null);

  useEffect(() => {
    try { setInvitation(sessionStorage.getItem(invitationKey) !== "yes"); }
    catch { setInvitation(true); }
    return () => request.current?.abort();
  }, []);

  function dismiss() {
    setInvitation(false);
    try { sessionStorage.setItem(invitationKey, "yes"); } catch { /* This page remembers the dismissal. */ }
  }
  function open() {
    dismiss();
    dialog.current.showModal();
  }
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("form-name", "tracker-feedback");
    const image = data.get("image");
    const attachment = data.get("attachment");
    if (!data.get("message").trim() && !image.size && !attachment.size) {
      setStatus({ error: true, message: "Write a message or choose a file to send." });
      return;
    }
    if (image.size + attachment.size > 7000000) {
      setStatus({ error: true, message: "Choose files that total 7 MB or less." });
      return;
    }
    if (image.size && !image.type.startsWith("image/")) {
      setStatus({ error: true, message: "Choose an image for the Image field, or use Other file." });
      return;
    }
    if (!feedbackHosts.has(location.hostname)) {
      setStatus({ message: "Feedback is available on the live tracker.", liveLink: true });
      return;
    }
    busy.current = true;
    setSending(true);
    setStatus({ message: "Sending feedback…" });
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch("/__forms.html", { method: "POST", body: data, signal: controller.signal });
      if (!response.ok) throw new Error("Feedback submission failed.");
      track("feedback_submitted");
      log("feedback_submission_completed");
      form.reset();
      setStatus(null);
      dialog.current.close();
      thanks.current.showModal();
    } catch {
      setStatus({ error: true, message: "Feedback couldn’t be sent. Your message is still here. Try again." });
    } finally {
      clearTimeout(timeout);
      request.current = null;
      busy.current = false;
      setSending(false);
    }
  }

  return <>
    <button type="button" id="feedback-button" className="secondary" onClick={open} ref={trigger}>Feedback</button>
    <aside id="feedback-prompt" className="feedback-prompt" aria-label="Feedback invitation" hidden={!invitation}>
      <button type="button" className="feedback-invitation" onClick={open}>Open for feedback <span aria-hidden="true">↗</span></button>
      <button type="button" className="feedback-dismiss" aria-label="Dismiss feedback invitation"
        onClick={() => { dismiss(); trigger.current.focus(); }}>×</button>
    </aside>
    <dialog id="feedback-dialog" ref={dialog} aria-labelledby="feedback-title" onClose={() => trigger.current?.focus()}>
      <form id="feedback-form" name="tracker-feedback" method="POST" encType="multipart/form-data" action="/__forms.html" onSubmit={submit}>
        <input type="hidden" name="form-name" value="tracker-feedback" />
        <p hidden><label>Leave blank <input name="bot-field" tabIndex={-1} autoComplete="off" /></label></p>
        <div className="dialog-heading"><h2 id="feedback-title">Send feedback</h2>
          <button type="button" className="icon" aria-label="Close feedback" onClick={() => dialog.current.close()}>×</button></div>
        <div id="feedback-fields">
          <label className="field">Message <textarea name="message" maxLength={5000} rows={4} /></label>
          <label className="field">Image (optional) <input name="image" type="file" accept="image/*" /></label>
          <label className="field">Other file (optional) <input name="attachment" type="file" /></label>
          <p className="muted">Up to 7 MB combined. Leave out CUE reports or other personal information.</p>
        </div>
        <p role="status" className={`feedback-status${status?.error ? " error" : ""}`} hidden={!status}>
          {status?.message} {status?.liveLink && <a href={liveHost}>Open live tracker</a>}
        </p>
        <div className="dialog-actions"><button className="primary" type="submit" disabled={sending}>Send feedback</button></div>
      </form>
    </dialog>
    <dialog id="feedback-thanks" ref={thanks} aria-labelledby="feedback-thanks-title" onClose={() => trigger.current?.focus()}>
      <form method="dialog" className="feedback-thanks-content">
        <span className="feedback-thanks-check" aria-hidden="true">✓</span>
        <h2 id="feedback-thanks-title">Thank you for your suggestion</h2>
        <button className="primary" autoFocus>Okay</button>
      </form>
    </dialog>
  </>;
}
