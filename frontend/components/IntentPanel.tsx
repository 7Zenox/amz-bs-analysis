"use client";

interface Fields {
  goal: string;
  marketplace: string;
  styleHints: string;
  nCandidates: number;
}

interface Props extends Fields {
  onChange: (fields: Partial<Fields>) => void;
  disabled?: boolean;
}

const MARKETPLACES = ["amazon", "shopify", "etsy", "generic"];

const inputClass = [
  "w-full border border-[var(--border)] rounded-xl px-3 py-2 text-sm bg-white",
  "focus:outline-none focus:ring-2 focus:ring-[var(--orange)] focus:border-transparent",
  "placeholder:text-[var(--muted)] disabled:opacity-50 text-[var(--black)]",
].join(" ");

export function IntentPanel({ goal, marketplace, styleHints, nCandidates, onChange, disabled }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-[var(--black)] uppercase tracking-wider mb-1.5">
          Goal
        </label>
        <input
          type="text"
          value={goal}
          onChange={(e) => onChange({ goal: e.target.value })}
          disabled={disabled}
          placeholder="Create a professional studio product image"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--black)] uppercase tracking-wider mb-1.5">
          Marketplace
        </label>
        <select
          value={marketplace}
          onChange={(e) => onChange({ marketplace: e.target.value })}
          disabled={disabled}
          className={inputClass}
        >
          {MARKETPLACES.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--black)] uppercase tracking-wider mb-1.5">
          Style hints{" "}
          <span className="text-[var(--muted)] font-normal normal-case">comma-separated</span>
        </label>
        <input
          type="text"
          value={styleHints}
          onChange={(e) => onChange({ styleHints: e.target.value })}
          disabled={disabled}
          placeholder="minimalist, soft shadows, white background"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[var(--black)] uppercase tracking-wider mb-1.5">
          Candidates —{" "}
          <span className="font-normal normal-case text-[var(--orange)]">{nCandidates}</span>
        </label>
        <input
          type="range"
          min={1}
          max={5}
          value={nCandidates}
          onChange={(e) => onChange({ nCandidates: Number(e.target.value) })}
          disabled={disabled}
          className="w-full accent-[var(--orange)] disabled:opacity-50"
        />
        <div className="flex justify-between text-xs text-[var(--muted)] mt-0.5">
          <span>1</span><span>5</span>
        </div>
      </div>
    </div>
  );
}
