"use client";

import { useEffect, useRef, useState } from "react";
import type { EnhanceResponse, SessionState } from "@/lib/types";
import { enhance, sendFeedback } from "@/lib/api";
import { Uploader } from "@/components/Uploader";
import { IntentPanel } from "@/components/IntentPanel";
import { AgentProgress } from "@/components/AgentProgress";
import { CandidateGrid } from "@/components/CandidateGrid";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { ErrorBanner } from "@/components/ErrorBanner";

const DEFAULT_STATE: SessionState = {
  positive_intent: [],
  negative_intent: [],
  fidelity_rules: [],
  product_description: "",
  strategy: "generate",
  revision: 0,
};

interface RunRecord {
  id: number;
  label: string;
  status: "running" | "done" | "error";
  nCandidates: number;
  result?: EnhanceResponse;
  error?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [goal, setGoal] = useState("Create a professional studio product image");
  const [marketplace, setMarketplace] = useState("amazon");
  const [styleHints, setStyleHints] = useState("");
  const [nCandidates, setNcandidates] = useState(3);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [sessionState, setSessionState] = useState<SessionState>(DEFAULT_STATE);
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);

  const imageB64Ref = useRef<string | null>(null);
  const imageMimeRef = useRef<string>("image/jpeg");
  const abortRef = useRef<AbortController | null>(null);
  const runEndRef = useRef<HTMLDivElement | null>(null);
  const runId = useRef(0);

  const running = runs.some((r) => r.status === "running");
  const latestDone = [...runs].reverse().find((r) => r.status === "done");

  function handleFile(f: File) {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function addRun(label: string, n: number): number {
    const id = ++runId.current;
    setRuns((prev) => [...prev, { id, label, status: "running", nCandidates: n }]);
    return id;
  }

  function finishRun(id: number, result: EnhanceResponse) {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "done", result } : r))
    );
  }

  function failRun(id: number, error: string) {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "error", error } : r))
    );
  }

  useEffect(() => {
    if (running) {
      setTimeout(() => runEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [runs.length, running]);

  async function run() {
    if (!file) return;
    abortRef.current = new AbortController();
    const id = addRun(runs.length === 0 ? "Initial run" : `Attempt ${runs.length + 1}`, nCandidates);
    try {
      const res = await enhance(
        file,
        {
          goal,
          marketplace,
          styleHints: styleHints.split(",").map((s) => s.trim()).filter(Boolean),
          nCandidates,
          stateJson: JSON.stringify(sessionState),
        },
        abortRef.current.signal
      );
      const best = res.candidates[0];
      if (best) {
        imageB64Ref.current = best.image_b64;
        imageMimeRef.current = best.mime_type;
      }
      finishRun(id, res);
      setSessionState(res.updated_state);
      
      setSelectedCandidate(res.candidates[0]?.index ?? null);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") failRun(id, e.message);
      else setRuns((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function handleFeedback(message: string) {
    if (!imageB64Ref.current) return;
    abortRef.current = new AbortController();
    const label = `Revision ${sessionState.revision + 1}: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`;
    const id = addRun(label, nCandidates);
    try {
      const res = await sendFeedback(
        {
          image_b64: imageB64Ref.current,
          mime_type: imageMimeRef.current,
          prior_state: sessionState,
          message,
          goal,
          marketplace,
          style_hints: styleHints.split(",").map((s) => s.trim()).filter(Boolean),
          n_candidates: nCandidates,
        },
        abortRef.current.signal
      );
      const best = res.candidates[0];
      if (best) {
        imageB64Ref.current = best.image_b64;
        imageMimeRef.current = best.mime_type;
      }
      finishRun(id, res);
      setSessionState(res.updated_state);
      
      setSelectedCandidate(res.candidates[0]?.index ?? null);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") failRun(id, e.message);
      else setRuns((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold"
              style={{ background: "var(--orange)" }}
            >
              P
            </span>
            <span className="font-semibold text-sm tracking-tight" style={{ color: "var(--black)" }}>
              Pixii
            </span>
          </div>
          {sessionState.revision > 0 && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "var(--orange-light)", color: "var(--orange)" }}
            >
              Rev {sessionState.revision}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ── Setup panel ── */}
        <section className="space-y-6">
          {runs.length === 0 && (
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--black)" }}>
                Transform your product photos
              </h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Upload a supplier image. Pixii turns it into studio-quality ecommerce photography.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Upload */}
            <div
              className="rounded-2xl p-5 border space-y-4"
              style={{ background: "white", borderColor: "var(--border)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--black)" }}>
                Source Image
              </p>
              <Uploader onFile={handleFile} preview={preview} disabled={running} />
            </div>

            {/* Intent + action */}
            <div
              className="rounded-2xl p-5 border space-y-5"
              style={{ background: "white", borderColor: "var(--border)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--black)" }}>
                Generation Settings
              </p>
              <IntentPanel
                goal={goal}
                marketplace={marketplace}
                styleHints={styleHints}
                nCandidates={nCandidates}
                onChange={(f) => {
                  if (f.goal !== undefined) setGoal(f.goal);
                  if (f.marketplace !== undefined) setMarketplace(f.marketplace);
                  if (f.styleHints !== undefined) setStyleHints(f.styleHints);
                  if (f.nCandidates !== undefined) setNcandidates(f.nCandidates);
                }}
                disabled={running}
              />
              <button
                onClick={run}
                disabled={!file || running}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--orange)" }}
                onMouseEnter={(e) => { if (file && !running) e.currentTarget.style.background = "var(--orange-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--orange)"; }}
              >
                {running ? "Processing…" : runs.length > 0 ? "Re-generate →" : "Enhance image →"}
              </button>
              {!file && (
                <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
                  Upload an image to get started
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Run history ── */}
        {runs.map((run, i) => (
          <section key={run.id} className="space-y-5 fade-in">
            {/* Run header */}
            <div className="flex items-center gap-3">
              <div
                className="h-px flex-1"
                style={{ background: "var(--border)" }}
              />
              <span
                className="text-xs font-mono px-3 py-1 rounded-full border whitespace-nowrap"
                style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface)" }}
              >
                {run.label}
              </span>
              <div
                className="h-px flex-1"
                style={{ background: "var(--border)" }}
              />
            </div>

            {/* Running state */}
            {run.status === "running" && (
              <div
                className="rounded-2xl border p-6 space-y-6"
                style={{ background: "white", borderColor: "var(--border)" }}
              >
                <AgentProgress nCandidates={run.nCandidates} />
              </div>
            )}

            {/* Error state */}
            {run.status === "error" && run.error && (
              <ErrorBanner message={run.error} />
            )}

            {/* Done state */}
            {run.status === "done" && run.result && (
              <div className="space-y-5">
                {/* Meta bar */}
                <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--muted)" }}>
                  <span>{(run.result.duration_ms / 1000).toFixed(1)}s</span>
                  <span>{run.result.candidates.length} candidates</span>
                  {run.result.updated_state.product_description && (
                    <span className="italic truncate max-w-xs">
                      {run.result.updated_state.product_description}
                    </span>
                  )}
                </div>

                <CandidateGrid
                  candidates={run.result.candidates}
                  selectedIndex={i === runs.filter((r) => r.status === "done").length - 1
                    ? selectedCandidate
                    : null}
                  onSelect={setSelectedCandidate}
                />

                {/* Export variants */}
                {run.result.export_variants.length > 0 && (
                  <div
                    className="rounded-2xl border p-4 space-y-3"
                    style={{ background: "white", borderColor: "var(--border)" }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--black)" }}>
                      Export variants
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {run.result.export_variants.map((v) => (
                        <div
                          key={v.name}
                          className="rounded-xl p-3 text-xs space-y-0.5"
                          style={{ background: "var(--surface)" }}
                        >
                          <p className="font-semibold" style={{ color: "var(--black)" }}>{v.name}</p>
                          <p style={{ color: "var(--muted)" }}>{v.width}×{v.height} · {v.format.toUpperCase()}</p>
                          <p style={{ color: "var(--muted)" }}>{v.background}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Feedback — only on the latest completed run */}
                {run.id === latestDone?.id && (
                  <FeedbackPanel onSubmit={handleFeedback} disabled={running} />
                )}
              </div>
            )}
          </section>
        ))}

        {/* Scroll anchor */}
        <div ref={runEndRef} />
      </div>
    </div>
  );
}
