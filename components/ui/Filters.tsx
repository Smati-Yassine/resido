"use client";

import { Icon } from "./Icon";

/** A search box with its icon, for filtering a list as you type. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-field">
      <span className="search-field-icon">
        <Icon name="search" size={17} />
      </span>
      <input
        className="input"
        type="search"
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** One-of-several filter, each option with its count. */
export function FilterChips<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (value: K) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className="segment"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.count !== undefined && <span className="segment-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
