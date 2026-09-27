"use client";

import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./Icon";
import { useI18n } from "./I18nProvider";

/**
 * The app's four modal sizes. A modal keeps its size while open — switching
 * tabs or revealing a field never makes it jump:
 * - confirm: 440 wide, fits its content (confirmations);
 * - form: 560 wide, fits its content (short forms);
 * - wide: 760 wide, fixed height, the body scrolls (forms that grow: payment, owner);
 * - panel: 1040 wide, fixed height, the body scrolls (settings with a side navigation).
 */
export type ModalSize = "confirm" | "form" | "wide" | "panel";

/**
 * Centered dialog over a dimmed backdrop: a header (optional icon, title,
 * subtitle, close), a body that scrolls, and — when the content ends with
 * ModalActions — a footer pinned at the bottom. Closes on Escape (the topmost
 * modal only) or a backdrop click; focuses its first field and locks page
 * scroll meanwhile. On a phone it is a sheet from the bottom edge, which a
 * drag down its header also closes.
 */
export function Modal({
  title,
  subtitle,
  size = "form",
  icon,
  tone = "primary",
  onClose,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: ModalSize;
  icon?: IconName;
  tone?: "primary" | "danger" | "warn";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
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
    const body = panel.current?.querySelector(".modal-body");
    // On a touch screen a focused field opens the keyboard over the sheet
    // before it is even read: the dialog itself takes the focus there.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    (touch
      ? panel.current
      : (body?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea") ??
        body?.querySelector<HTMLElement>("button"))
    )?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // On a phone the modal is a bottom sheet (globals.css): its header drags it
  // down, and let go far or fast enough, it closes.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onDragStart = (event: React.PointerEvent) => {
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    drag.current = { y: event.clientY, t: event.timeStamp, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: React.PointerEvent) => {
    const el = panel.current;
    if (!drag.current || !el) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.y);
    el.dataset.dragging = "true";
    el.style.setProperty("--drag", `${drag.current.dy}px`);
  };
  const onDragEnd = (event: React.PointerEvent) => {
    const el = panel.current;
    const d = drag.current;
    drag.current = null;
    if (!d || !el) return;
    const speed = d.dy / Math.max(1, event.timeStamp - d.t); // px per ms
    if (d.dy > 120 || (d.dy > 30 && speed > 0.6)) return onClose();
    el.dataset.dragging = "release";
    setTimeout(() => el.removeAttribute("data-dragging"), 200);
  };

  return (
    <div
      ref={overlay}
      className="modal-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <div
          className="modal-head"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          {icon && (
            <span className="modal-icon" data-tone={tone}>
              <Icon name={icon} size={20} />
            </span>
          )}
          <div className="modal-head-text">
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-btn icon-btn-bare modal-close"
            aria-label={t.cancel}
            title={t.cancel}
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
