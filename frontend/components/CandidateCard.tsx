"use client";

import type { Candidate } from "@/lib/types";

interface Props {
  candidate: Candidate;
  selected: boolean;
  onSelect: () => void;
}

export function CandidateCard({ candidate, selected, onSelect }: Props) {
  function download() {
    const a = document.createElement("a");
    a.href = `data:${candidate.mime_type};base64,${candidate.image_b64}`;
    a.download = `candidate-${candidate.index + 1}.${candidate.mime_type.split("/")[1]}`;
    a.click();
  }

  return (
    <div
      onClick={onSelect}
      className={[
        "rounded-2xl border-2 overflow-hidden cursor-pointer transition-all duration-200 bg-white",
        selected
          ? "border-[var(--orange)] shadow-lg"
          : "border-[var(--border)] hover:border-[var(--orange)]/50",
      ].join(" ")}
    >
      <div className="aspect-square bg-[var(--surface)]">
        <img
          src={`data:${candidate.mime_type};base64,${candidate.image_b64}`}
          alt={`Candidate ${candidate.index + 1}`}
          className="w-full h-full object-contain"
        />
      </div>

      <div className="p-3 flex items-center justify-between border-t border-[var(--border)]">
        <div>
          <p className="text-xs font-semibold text-[var(--black)] uppercase tracking-wider">
            Candidate {candidate.index + 1}
          </p>
          <p className="text-xs text-[var(--muted)] font-mono">
            {candidate.width}×{candidate.height}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); download(); }}
          className="text-xs font-semibold text-[var(--orange)] hover:text-[var(--orange-hover)] transition-colors"
        >
          Download ↓
        </button>
      </div>
    </div>
  );
}
