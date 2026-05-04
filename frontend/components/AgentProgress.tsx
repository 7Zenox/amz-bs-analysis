"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { at: 0,  text: "Reading your image and analyzing its current quality…" },
  { at: 6,  text: "Identifying your product's key features and attributes…" },
  { at: 14, text: "Mapping what must be preserved in the final image…" },
  { at: 22, text: "Designing composition, lighting, and background rules…" },
  { at: 30, text: "Planning the best generation strategies for your product…" },
  { at: 37, text: "Writing a precise generation prompt…" },
  { at: 43, text: "Generating your enhanced product candidates…" },
  { at: 63, text: "Reviewing image quality and marketplace compliance…" },
  { at: 75, text: "Finalizing export variants and packaging results…" },
];

interface Props {
  nCandidates: number;
}

export function AgentProgress({ nCandidates }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [visibleSteps, setVisibleSteps] = useState<typeof STEPS>([]);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      setElapsed(s);
      setVisibleSteps(STEPS.filter((step) => step.at <= s));
    }, 500);
    return () => clearInterval(id);
  }, []);

  const currentStep = [...visibleSteps].pop();

  return (
    <div className="space-y-6">
      {/* Active step */}
      <div className="flex items-start gap-3">
        <div className="mt-1 flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[var(--orange)] inline-block"
              style={{ animation: `pulse-dot 1.2s ${i * 0.2}s ease-in-out infinite` }}
            />
          ))}
        </div>
        <p className="text-sm text-[var(--black)] font-medium leading-relaxed fade-in" key={currentStep?.text}>
          {currentStep?.text ?? "Starting up…"}
        </p>
      </div>

      {/* Step trail */}
      {visibleSteps.length > 1 && (
        <ol className="space-y-1.5 pl-5 border-l border-[var(--border)]">
          {visibleSteps.slice(0, -1).map((step) => (
            <li key={step.text} className="text-xs text-[var(--muted)] fade-in">
              ✓ {step.text}
            </li>
          ))}
        </ol>
      )}

      {/* Skeleton candidate cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
        {Array.from({ length: nCandidates }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--border)] overflow-hidden"
            style={{ opacity: 1 - i * 0.15 }}
          >
            <div className="aspect-square skeleton" />
            <div className="p-3 space-y-2 bg-white/60">
              <div className="h-3 w-24 rounded skeleton" />
              <div className="h-2 w-full rounded skeleton" />
              <div className="h-2 w-4/5 rounded skeleton" />
              <div className="h-2 w-3/5 rounded skeleton" />
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)] font-mono">{elapsed}s elapsed</p>
    </div>
  );
}
