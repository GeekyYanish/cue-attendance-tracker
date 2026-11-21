"use client";

import { useRef } from "react";

export default function Portfolio() {
  const details = useRef(null);
  const hovering = useRef(false);
  function leave() {
    const node = details.current;
    if (!hovering.current || node.matches(":hover, :focus-within")) return;
    hovering.current = false;
    node.open = false;
  }
  return <div className="portfolio-slot">
    <details className="portfolio-envelope" id="portfolio-envelope" ref={details}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" && !details.current.open) {
          hovering.current = true;
          details.current.open = true;
        }
      }} onPointerLeave={leave} onBlur={() => queueMicrotask(leave)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !details.current.open) return;
        event.preventDefault();
        hovering.current = false;
        details.current.open = false;
        details.current.querySelector("summary").focus();
      }}>
      <summary onClick={(event) => {
        if (hovering.current) { event.preventDefault(); hovering.current = false; }
      }}>
        <span className="envelope-art" aria-hidden="true">
          {["left", "right", "pocket", "seams", "shadow", "flap"].map((part) =>
            <img key={part} className={`envelope-${part}`} src={`/envelope-${part}.svg`} alt="" />)}
        </span><span className="envelope-label">Portfolio</span>
      </summary>
      <div className="portfolio-letter"><p>More about me</p><a href="https://yanish.me/">yanish.me <span aria-hidden="true">↗</span></a></div>
    </details>
  </div>;
}
