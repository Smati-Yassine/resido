"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/** A button that opens a modal; the modal gets `close` to dismiss itself. */
export function ModalButton({
  label,
  className = "btn btn-primary",
  icon,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  icon?: IconName;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {icon && <Icon name={icon} size={16} strokeWidth={2.2} />}
        {label}
      </button>
      {open && children(() => setOpen(false))}
    </>
  );
}
