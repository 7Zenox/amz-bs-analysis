"use client";

import { useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  preview?: string | null;
  disabled?: boolean;
}

export function Uploader({ onFile, preview, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && file.type.startsWith("image/")) onFile(file);
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={[
        "relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden",
        "cursor-pointer select-none",
        dragging
          ? "border-[var(--orange)] bg-[var(--orange-light)]"
          : preview
          ? "border-[var(--border)] hover:border-[var(--orange)]"
          : "border-[var(--border)] hover:border-[var(--orange)] bg-[var(--surface)]",
        disabled ? "opacity-50 pointer-events-none" : "",
      ].join(" ")}
      style={{ minHeight: preview ? 0 : 200 }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />

      {preview ? (
        <div className="relative group">
          <img
            src={preview}
            alt="Source product"
            className="w-full max-h-64 object-contain p-2"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
            <span className="text-white text-sm font-medium">Replace image</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--orange-light)] flex items-center justify-center text-2xl">
            ↑
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--black)]">Drop your product image</p>
            <p className="text-xs text-[var(--muted)] mt-1">JPEG · PNG · WebP · max 25 MB</p>
          </div>
        </div>
      )}
    </div>
  );
}
