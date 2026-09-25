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
 * scroll meanwhile.
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
    (
      body?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select, textarea") ??
      body?.querySelector<HTMLElement>("button")
    )?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      ref={overlay}
      className="modal-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div ref={panel} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
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
