"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { initials } from "@/lib/format";
import { fold } from "@/lib/text";

type Option = { id: string; name: string };

/**
 * The owners of one lot — none, one, or several (co-ownership): chosen owners
 * as removable chips, and a search to add more. Posts them as `ownerIds`.
 */
export function OwnerPicker({ owners, initial }: { owners: Option[]; initial: string[] }) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const matches = owners.filter((o) => !chosen.includes(o.id) && (!q || fold(o.name).includes(q))).slice(0, 6);
  const nameOf = new Map(owners.map((o) => [o.id, o.name]));

  return (
    <div className="flex flex-col gap-2.5">
      {chosen.map((id) => (
        <input key={id} type="hidden" name="ownerIds" value={id} />
      ))}
      <div className="flex min-h-[46px] flex-wrap items-center gap-2 rounded-[10px] border border-line-2 px-2.5 py-2">
        {chosen.length === 0 && <span className="px-1 text-sm text-muted">{t.noOwnerYet}</span>}
        {chosen.map((id) => (
          <span key={id} className="owner-chip">
            <span className="avatar avatar-xs">{initials(nameOf.get(id) ?? "?")}</span>
            {nameOf.get(id) ?? "?"}
            <button
              type="button"
              className="owner-chip-remove"
              aria-label={`${t.remove} — ${nameOf.get(id)}`}
              onClick={() => setChosen((c) => c.filter((x) => x !== id))}
            >
              <Icon name="close" size={13} strokeWidth={2.4} />
            </button>
          </span>
        ))}
      </div>
      {owners.length > chosen.length && (
        <div className="flex flex-col gap-1.5">
          <label className="search-field max-w-none flex-none">
            <span className="search-field-icon">
              <Icon name="search" size={16} />
            </span>
            <input
              className="input h-10 text-sm"
              type="search"
              value={query}
              autoComplete="off"
              placeholder={t.addOwnerSearch}
              aria-label={t.addOwnerSearch}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((o) => (
              <button
                key={o.id}
                type="button"
                className="owner-chip owner-chip-add"
                onClick={() => {
                  setChosen((c) => [...c, o.id]);
                  setQuery("");
                }}
              >
                <Icon name="plus" size={13} strokeWidth={2.4} />
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
