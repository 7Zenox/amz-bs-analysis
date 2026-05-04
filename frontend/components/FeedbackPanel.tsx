"use client";

import { useState } from "react";

interface Props {
  onSubmit: (message: string) => void;
  disabled?: boolean;
}

export function FeedbackPanel({ onSubmit, disabled }: Props) {
  const [message, setMessage] = useState("");

  function submit() {
    if (!message.trim()) return;
    onSubmit(message.trim());
    setMessage("");
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-3">
      <p className="text-xs font-semibold text-[var(--black)] uppercase tracking-wider">
        Refine with feedback
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={disabled}
        placeholder="Keep the bottle the same but use a pure white background. Remove reflections."
        rows={3}
        className="w-full border border-[var(--border)] rounded-xl px-3 py-2 text-sm bg-[var(--bg)] focus:outline-none focus:ring-2 focus:ring-[var(--orange)] focus:border-transparent placeholder:text-[var(--muted)] disabled:opacity-50 resize-none text-[var(--black)]"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={disabled || !message.trim()}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "var(--orange)" }}
          onMouseEnter={(e) => { if (!disabled && message.trim()) e.currentTarget.style.background = "var(--orange-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--orange)"; }}
        >
          Regenerate
        </button>
        <p className="text-xs text-[var(--muted)]">
          AI will remember your prior preferences.
        </p>
      </div>
    </div>
  );
}
