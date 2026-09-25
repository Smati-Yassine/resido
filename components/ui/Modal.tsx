"use client";

import { useEffect, useRef } from "react";

/**
 * Centered dialog over a dimmed backdrop. Closes on Escape or a backdrop
 * click, focuses its first field on open, and locks page scroll meanwhile.
 */
export function Modal({
  title,
  subtitle,
  width = 480,
  onClose,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Modals can stack (a confirmation over settings): Escape closes the topmost only.
      const open = document.querySelectorAll(".modal-overlay");
      if (open[open.length - 1] === overlay.current) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div ref={overlay} className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{ maxWidth: width }}
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
