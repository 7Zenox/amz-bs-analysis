import type { EnhanceResponse, FeedbackRequest } from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function enhance(
  file: File,
  options: {
    goal: string;
    marketplace: string;
    styleHints: string[];
    nCandidates: number;
    stateJson?: string;
  },
  signal?: AbortSignal
): Promise<EnhanceResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("goal", options.goal);
  form.append("marketplace", options.marketplace);
  form.append("style_hints", options.styleHints.join(","));
  form.append("n_candidates", String(options.nCandidates));
  form.append("state_json", options.stateJson ?? "{}");

  const res = await fetch(`${BASE}/enhance`, {
    method: "POST",
    body: form,
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Enhancement failed");
  }

  return res.json() as Promise<EnhanceResponse>;
}

export async function sendFeedback(
  req: FeedbackRequest,
  signal?: AbortSignal
): Promise<EnhanceResponse> {
  const res = await fetch(`${BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Feedback failed");
  }

  return res.json() as Promise<EnhanceResponse>;
}
