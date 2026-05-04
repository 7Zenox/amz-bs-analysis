"use client";

import { useEffect, useState } from "react";

interface Props {
  running: boolean;
}

export function JobProgress({ running }: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-blue-200 rounded-full" />
        <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
      <div className="text-center">
        <p className="font-medium text-gray-700">Enhancing your product image…</p>
        <p className="text-sm text-gray-400 mt-1">
          {elapsed < 10
            ? "Analyzing product…"
            : elapsed < 30
            ? "Generating candidates…"
            : elapsed < 60
            ? "Reviewing quality…"
            : "Almost there…"}
        </p>
        <p className="text-xs text-gray-400 mt-2 font-mono">{elapsed}s</p>
      </div>
    </div>
  );
}
