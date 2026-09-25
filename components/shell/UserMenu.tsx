"use client";

import { useState } from "react";
import { usePopover } from "@/components/ui/usePopover";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { initials } from "@/lib/format";
import type { Theme } from "@/lib/i18n/server";
import { useSignOut } from "./useSignOut";
import { AccountSettingsModal, type ExportableResidence } from "./AccountSettingsModal";

/** The user's name in the top bar; opens account Settings and Sign out. */
export function UserMenu({
  user,
  theme,
  residences,
}: {
  user: { name: string; email: string };
  theme: Theme;
  residences: ExportableResidence[];
}) {
  const { t } = useI18n();
  const { run: signOut, pending } = useSignOut();
  const { open, toggle, close, ref } = usePopover();
  const [settings, setSettings] = useState(false);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.accountMenu}
        onClick={toggle}
      >
        <span className="hidden text-sm font-semibold text-ink-2 sm:inline">{user.name}</span>
        <span className="avatar">{initials(user.name)}</span>
        <Icon name="chevronDown" size={16} strokeWidth={2} />
      </button>
      {open && (
        <div role="menu" className="popover absolute right-0 top-[52px] z-20 flex w-[260px] flex-col gap-0.5">
          <div className="flex flex-col gap-0.5 px-3 pb-2 pt-1.5">
            <span className="text-sm font-bold">{user.name}</span>
            <span className="truncate text-xs text-muted">{user.email}</span>
          </div>
          <div className="divider mx-1 mb-1" />
          <button
            type="button"
            role="menuitem"
            className="menu-item justify-start py-2.5 text-sm font-semibold"
            onClick={() => {
              close();
              setSettings(true);
            }}
          >
            <Icon name="settings" size={16} />
            {t.settings}
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item justify-start py-2.5 text-sm font-semibold"
            disabled={pending}
            onClick={signOut}
          >
            <Icon name="logout" size={16} />
            {t.signOut}
          </button>
        </div>
      )}
      {settings && (
        <AccountSettingsModal
          user={user}
          theme={theme}

          residences={residences}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}
