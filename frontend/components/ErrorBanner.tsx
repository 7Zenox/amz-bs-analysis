"use client";

interface Props {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
      <span className="text-red-500 mt-0.5">⚠</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-red-800">Something went wrong</p>
        <p className="text-xs text-red-600 mt-0.5">{message}</p>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 text-sm transition-colors">
          ✕
        </button>
      )}
    </div>
  );
}
