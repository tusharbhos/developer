// components/SearchBar.tsx
"use client";

import React from "react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onFilterClick: () => void;
  activeFilterCount?: number;
}

export default function SearchBar({
  value,
  onChange,
  onFilterClick,
  activeFilterCount = 0,
}: SearchBarProps) {
  return (
    <div className="search-container w-full max-w-3xl mx-auto">
      {/* ── Search Input ── */}
      <div className="search-input-wrap">
        {/* Search icon */}
        <span className="search-icon">
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
            />
          </svg>
        </span>

        <input
          type="search"
          className="search-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search projects, developers, locations…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {/* Clear button */}
        {value && (
          <button
            className="search-clear"
            onClick={() => onChange("")}
            aria-label="Clear search"
            type="button"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Filter Button ── */}
      <button
        type="button"
        className={`filter-btn${activeFilterCount > 0 ? " active" : ""}`}
        onClick={onFilterClick}
        aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
      >
        {/* Funnel icon */}
        <svg
          width="16"
          height="16"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.2}
          style={{ flexShrink: 0 }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
          />
        </svg>

        {/* Label hidden on very small screens via CSS */}
        <span className="filter-label">Filters</span>

        {/* Active count badge */}
        {activeFilterCount > 0 && (
          <span className="filter-badge" aria-hidden="true">
            {activeFilterCount > 9 ? "9+" : activeFilterCount}
          </span>
        )}
      </button>
    </div>
  );
}