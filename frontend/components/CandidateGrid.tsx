"use client";

import type { Candidate } from "@/lib/types";
import { CandidateCard } from "./CandidateCard";

interface Props {
  candidates: Candidate[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

export function CandidateGrid({ candidates, selectedIndex, onSelect }: Props) {
  if (candidates.length === 0) return null;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="text-xs font-semibold text-[var(--black)] uppercase tracking-wider">
          Candidates
        </h3>
        <span className="text-xs text-[var(--muted)]">
          {candidates.length} generated
        </span>
      </div>
      <div className={[
        "grid gap-4",
        candidates.length === 1
          ? "grid-cols-1 max-w-xs"
          : candidates.length === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      ].join(" ")}>
        {candidates.map((c) => (
          <CandidateCard
            key={c.index}
            candidate={c}
            selected={selectedIndex === c.index}
            onSelect={() => onSelect(c.index)}
          />
        ))}
      </div>
    </div>
  );
}
