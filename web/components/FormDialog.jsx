"use client";

import { useEffect, useRef, useState } from "react";

export function Field({ title, name, value = "", required = false, mode, placeholder, maxLength, multiline = false }) {
  const Component = multiline ? "textarea" : "input";
  return <label className="field">{title}<Component name={name} defaultValue={value} required={required}
    inputMode={mode} placeholder={placeholder} maxLength={maxLength} /></label>;
}

export default function FormDialog({ config, onClose }) {
  const dialog = useRef(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    const node = dialog.current;
    node.showModal();
    const first = config.destructive ? node.querySelector("[data-cancel]") : node.querySelector("#dialog-fields input, #dialog-fields textarea, #dialog-fields select, #dialog-fields button");
    first?.focus();
    return () => { alive.current = false; node.close(); };
  }, [config.destructive]);

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const message = await config.submit(new FormData(event.currentTarget), () => alive.current);
      if (alive.current && message) onClose(message);
    } catch (failure) {
      if (alive.current) setError(failure.message);
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return <dialog ref={dialog} id="editor" aria-labelledby="dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <form id="dialog-form" onSubmit={submit}>
      <div className="dialog-heading"><h2 id="dialog-title">{config.title}</h2>
        <button type="button" className="icon" aria-label="Close dialog" onClick={() => onClose()}>×</button></div>
      <div id="dialog-fields">{config.fields}</div>
      <p id="dialog-error" role="alert" className="error" hidden={!error}>{error}</p>
      <div className="dialog-actions" id="dialog-actions">
        <button type="button" className="secondary" data-cancel onClick={() => onClose()}>Cancel</button>
        <button type="submit" className={`primary${config.destructive ? " danger" : ""}`} disabled={saving}>
          {saving ? "Processing…" : config.accept}
        </button>
      </div>
    </form>
  </dialog>;
}
