"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { MarketReport } from "@/lib/server/market/pipeline";
import type { EnrichedProduct } from "@/lib/server/market/analysis";

const ORANGE = "#E8652D";
const BORDER = "#EDE8E0";
const MUTED = "#6B6560";
const BG = "#FAF8F4";

// ── Hooks ──────────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200, active = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active || target === 0) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration, active]);
  return val;
}

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmtRev(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
}
function fmtNum(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(1)}L`;
  return n.toLocaleString("en-IN");
}

// ── Shared card ────────────────────────────────────────────────────────────────
const Card = React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string; style?: React.CSSProperties }>(
  function Card({ children, className = "", style }, ref) {
    return <div ref={ref} className={`bg-white rounded-2xl border ${className}`} style={{ borderColor: BORDER, ...style }}>{children}</div>;
  }
);

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ORANGE }} />
      <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUTED }}>{children}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT PAGE
// ═══════════════════════════════════════════════════════════════════════════════
interface ProgressUpdate { stage: string; message: string; pct: number; }

export default function MarketPage() {
  const [url, setUrl] = useState("");
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [report, setReport] = useState<MarketReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!url.trim()) return;
    setRunning(true); setReport(null); setError(null);
    setProgress({ stage: "starting", message: "Initialising…", pct: 2 });
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
        signal: abortRef.current.signal,
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          const raw = line.replace(/^data: /, "").trim();
          if (!raw) continue;
          try {
            const msg = JSON.parse(raw);
            if (msg.type === "progress") setProgress(msg);
            else if (msg.type === "result") setReport(msg.report);
            else if (msg.type === "error") setError(msg.message);
          } catch {}
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally { setRunning(false); }
  }, [url]);

  const STEPS = ["Scraping listings", "Product details", "Review mining", "AI analysis"];
  const STEP_THRESHOLDS = [5, 15, 45, 78];

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b" style={{ background: `${BG}cc`, backdropFilter: "blur(12px)", borderColor: BORDER }}>
        <div className="max-w-5xl mx-auto px-6 h-13 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-5 w-5 rounded text-[10px] font-black flex items-center justify-center text-white" style={{ background: ORANGE }}>P</span>
            <span className="font-bold tracking-tight text-sm">Pixii</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#FDF0EA", color: ORANGE }}>Market Intelligence</span>
          </div>
          <a href="https://www.pixii.ai" target="_blank" rel="noopener noreferrer"
            className="text-xs transition-colors hover:opacity-70" style={{ color: MUTED }}>
            pixii.ai ↗
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Hero input */}
        {!report && !running && (
          <div className="py-16 text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">Know your market before entering it.</h1>
              <p style={{ color: MUTED }} className="text-base max-w-md mx-auto">
                Paste an Amazon Best Sellers URL. Get revenue estimates, brand landscape, customer voice, and entry strategy — in minutes.
              </p>
            </div>
            <div className="max-w-xl mx-auto">
              <div className="flex gap-2">
                <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && run()}
                  placeholder="https://www.amazon.in/gp/bestsellers/…"
                  className="flex-1 rounded-xl px-4 py-3 text-sm border outline-none focus:ring-2"
                  style={{ borderColor: BORDER, background: "white", focusRingColor: ORANGE } as React.CSSProperties} />
                <button onClick={run}
                  className="px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                  style={{ background: ORANGE }}>
                  Analyze →
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: MUTED }}>Works with .in · .com · .co.uk · .de · .ca · .com.au</p>
            </div>
          </div>
        )}

        {/* Compact input (while running or after result) */}
        {(running || report) && (
          <Card className="p-4">
            <div className="flex gap-3">
              <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !running && run()}
                className="flex-1 rounded-lg px-3 py-2 text-sm border outline-none"
                style={{ borderColor: BORDER, background: BG }}/>
              <button onClick={running ? () => { abortRef.current?.abort(); setRunning(false); } : run}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95"
                style={running ? { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5" }
                              : { background: ORANGE, color: "white" }}>
                {running ? "Cancel" : "Analyze"}
              </button>
            </div>
          </Card>
        )}

        {/* Progress */}
        {running && progress && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{progress.message}</span>
              <span style={{ color: MUTED }} className="tabular-nums">{progress.pct}%</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: BORDER }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress.pct}%`, background: ORANGE }} />
            </div>
            <div className="flex gap-2 flex-wrap">
              {STEPS.map((step, i) => {
                const done = progress.pct > STEP_THRESHOLDS[i] + 15;
                const active = !done && progress.pct >= STEP_THRESHOLDS[i];
                return (
                  <span key={step} className="text-xs px-3 py-1.5 rounded-full border font-medium transition-all duration-300"
                    style={done   ? { background: "#F0FDF4", color: "#166534", borderColor: "#BBF7D0" }
                         : active ? { background: "#FDF0EA", color: ORANGE, borderColor: "#FBDACC" }
                                  : { background: BG, color: MUTED, borderColor: BORDER }}>
                    {done ? "✓ " : active ? "· " : ""}{step}
                  </span>
                );
              })}
            </div>
          </Card>
        )}

        {error && (
          <Card className="p-4" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}

        {report && <ReportView report={report} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════════
function ReportView({ report }: { report: MarketReport }) {
  const { stats, brands, priceGaps, newEntrants, report: opp, products } = report;

  return (
    <div className="space-y-6 pb-16">
      <MarketHero report={report} />
      <BrandDominance brands={brands} totalRev={stats.totalMonthlyRevenue} />
      <PriceLandscape products={products} gaps={priceGaps} />
      <CustomerVoice insights={opp.reviewInsights} />
      <div className="grid sm:grid-cols-2 gap-6">
        <OpportunityCards opportunities={opp.opportunities} />
        <EntryAndRisk rec={opp.entryRecommendation} risks={opp.riskFactors} />
      </div>
      {newEntrants.length > 0 && <RisingStars entrants={newEntrants} />}
      <ProductTable products={products} />
    </div>
  );
}

// ── 1. Market Hero ─────────────────────────────────────────────────────────────
function MarketHero({ report }: { report: MarketReport }) {
  const { ref, inView } = useInView();
  const { stats, report: opp } = report;
  const rev = useCountUp(stats.totalMonthlyRevenue, 1400, inView);
  const annual = useCountUp(stats.totalAnnualRevenue, 1600, inView);

  return (
    <div ref={ref} className="rounded-2xl overflow-hidden border" style={{ borderColor: BORDER }}>
      {/* Top strip */}
      <div className="px-8 pt-8 pb-6" style={{ background: "#0A0A0A" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: ORANGE }}>
              Market Intelligence
            </p>
            <h2 className="text-3xl font-bold text-white">{report.categoryName}</h2>
            <p className="text-sm mt-1" style={{ color: "#6B6560" }}>
              {report.products.length} products · {new Date(report.scrapedAt).toLocaleString()}
            </p>
          </div>
          {/* Monthly rev big number */}
          <div className="text-right shrink-0">
            <div className="text-[42px] font-bold leading-none text-white tabular-nums">
              {inView ? fmtRev(rev) : "—"}
            </div>
            <div className="text-xs mt-1" style={{ color: "#6B6560" }}>monthly market revenue</div>
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t" style={{ borderColor: "#1F1F1F" }}>
          {[
            { label: "Annual estimate", value: inView ? fmtRev(annual) : "—" },
            { label: "Avg price", value: stats.avgPrice ? `₹${stats.avgPrice}` : "—" },
            { label: "Avg rating", value: stats.avgRating ? `${stats.avgRating} / 5` : "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-xs mb-1" style={{ color: "#6B6560" }}>{label}</div>
              <div className="text-xl font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Narrative strip */}
      <div className="px-8 py-5 bg-white">
        <p className="text-sm leading-relaxed" style={{ color: "#0A0A0A" }}>{opp.marketNarrative}</p>
      </div>
    </div>
  );
}

// ── 2. Brand Dominance ─────────────────────────────────────────────────────────
const BRAND_COLORS = [
  "#E8652D", // Pixii orange
  "#5B6AF0", // indigo
  "#0D9488", // teal
  "#D97706", // amber
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#DC2626", // red
  "#16A34A", // green
];

function BrandDominance({ brands, totalRev }: { brands: MarketReport["brands"]; totalRev: number }) {
  const { ref, inView } = useInView();
  const top = brands.slice(0, 8);
  const topRevShare = top.reduce((s, b) => s + (totalRev > 0 ? (b.totalMonthlyRevenue / totalRev) * 100 : 0), 0);
  const othersShare = Math.max(0, 100 - topRevShare);

  return (
    <Card className="p-6" ref={ref as React.RefObject<HTMLDivElement>}>
      <Label>Brand Dominance</Label>

      {/* Proportional share strip */}
      <div className="flex h-20 rounded-xl overflow-hidden mb-1 gap-px" style={{ background: BORDER }}>
        {top.map((b, i) => {
          const share = totalRev > 0 ? (b.totalMonthlyRevenue / totalRev) * 100 : 0;
          return (
            <div key={b.brand}
              title={`${b.brand} · ${b.revenueShare}% · ${fmtRev(b.totalMonthlyRevenue)}`}
              className="relative flex flex-col items-center justify-center cursor-default overflow-hidden transition-all duration-300 hover:brightness-110 group"
              style={{ flex: `${share} 0 0%`, background: BRAND_COLORS[i], minWidth: 0 }}>
              {share > 6 && (
                <>
                  <span className="text-[10px] font-bold text-white truncate px-1 leading-tight">{b.brand}</span>
                  <span className="text-[10px] text-white/70 tabular-nums">{b.revenueShare}%</span>
                </>
              )}
              {/* Hover tooltip */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `${BRAND_COLORS[i]}ee` }}>
                <div className="text-center px-2">
                  <div className="text-xs font-bold text-white">{b.brand}</div>
                  <div className="text-[10px] text-white/80">{fmtRev(b.totalMonthlyRevenue)}/mo</div>
                </div>
              </div>
            </div>
          );
        })}
        {othersShare > 1 && (
          <div className="flex items-center justify-center" style={{ flex: `${othersShare} 0 0%`, background: "#D4CEC6", minWidth: 0 }}>
            {othersShare > 6 && <span className="text-[10px] font-medium text-white/80">Others {Math.round(othersShare)}%</span>}
          </div>
        )}
      </div>

      {/* Scale ticks */}
      <div className="flex justify-between text-[10px] mb-5" style={{ color: MUTED }}>
        <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
      </div>

      {/* Legend rows with animated bars */}
      <div className="space-y-2.5">
        {top.map((b, i) => {
          const maxShare = top[0].revenueShare;
          const barW = (b.revenueShare / maxShare) * 100;
          return (
            <div key={b.brand} className="flex items-center gap-3 group">
              <span className="h-3 w-3 rounded shrink-0" style={{ background: BRAND_COLORS[i] }} />
              <span className="text-xs font-semibold w-24 truncate">{b.brand}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: BORDER }}>
                <div className="h-full rounded-full origin-left"
                  style={{
                    width: `${barW}%`,
                    background: BRAND_COLORS[i],
                    animation: inView ? `barGrow 0.8s cubic-bezier(0.22,1,0.36,1) ${i * 70}ms forwards` : "none",
                    transform: inView ? undefined : "scaleX(0)",
                    opacity: 0.85,
                  }} />
              </div>
              <span className="text-xs tabular-nums font-bold w-8 text-right">{b.revenueShare}%</span>
              <span className="text-xs tabular-nums w-14 text-right" style={{ color: MUTED }}>{fmtRev(b.totalMonthlyRevenue)}</span>
              <span className="text-[10px] tabular-nums w-12 text-right" style={{ color: MUTED }}>
                {b.avgRating ? `${b.avgRating}★` : "—"} · {b.productCount}p
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── 3. Price Landscape ─────────────────────────────────────────────────────────

// ── Price landscape: histogram buckets ────────────────────────────────────────
function PriceLandscape({ products, gaps }: { products: EnrichedProduct[]; gaps: MarketReport["priceGaps"] }) {
  const { ref, inView } = useInView(0.1);
  const [activeBucket, setActiveBucket] = useState<number | null>(null);

  const priced = products.filter(p => p.price != null).sort((a, b) => a.price! - b.price!);
  if (priced.length === 0) return null;

  const minP = Math.min(...priced.map(p => p.price!));
  const maxP = Math.max(...priced.map(p => p.price!));

  // Build ~10 buckets across the price range
  const BUCKETS = 10;
  const bucketSize = Math.ceil((maxP - minP + 1) / BUCKETS);
  const buckets = Array.from({ length: BUCKETS }, (_, i) => {
    const from = minP + i * bucketSize;
    const to = from + bucketSize - 1;
    const items = priced.filter(p => p.price! >= from && p.price! <= to);
    const totalRev = items.reduce((s, p) => s + (p.monthlyRevenue ?? 0), 0);
    const isGap = gaps.some(g => g.playerCount === 0 && g.from <= to && g.to >= from);
    return { from, to, items, totalRev, isGap };
  }).filter(b => b.from <= maxP);

  const maxRev = Math.max(...buckets.map(b => b.totalRev), 1);

  // Products visible in active bucket
  const activeBucketProducts = activeBucket !== null ? buckets[activeBucket]?.items ?? [] : [];

  return (
    <Card className="p-6" ref={ref as React.RefObject<HTMLDivElement>}>
      <Label>Price Landscape</Label>
      <p className="text-xs mb-5" style={{ color: MUTED }}>
        Bar height = estimated monthly revenue in that price band · Click a bar to see products · Orange dashes mark uncontested gaps
      </p>

      {/* Histogram */}
      <div className="flex items-end gap-1.5 h-48 mb-1">
        {buckets.map((b, i) => {
          const heightPct = b.totalRev > 0 ? (b.totalRev / maxRev) * 100 : 0;
          const isActive = activeBucket === i;
          const hasProducts = b.items.length > 0;

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
              onClick={() => setActiveBucket(isActive ? null : i)}
              style={{ cursor: hasProducts ? "pointer" : "default" }}>
              {/* Bar */}
              <div className="w-full relative rounded-t-lg overflow-hidden flex items-end"
                style={{ height: "100%", background: BG }}>
                {/* Gap indicator */}
                {b.isGap && !hasProducts && (
                  <div className="absolute inset-0 rounded-t-lg border border-dashed flex items-center justify-center"
                    style={{ borderColor: ORANGE, background: "#FDF0EA" }}>
                    <span className="text-[9px] font-bold" style={{ color: ORANGE }}>GAP</span>
                  </div>
                )}
                {hasProducts && (
                  <div className="w-full rounded-t-lg origin-bottom transition-all duration-200"
                    style={{
                      height: `${heightPct}%`,
                      minHeight: 6,
                      background: isActive
                        ? ORANGE
                        : b.isGap
                        ? "#FBDACC"
                        : i % 3 === 0 ? BRAND_COLORS[1]
                        : i % 3 === 1 ? BRAND_COLORS[2]
                        : BRAND_COLORS[0],
                      opacity: activeBucket !== null && !isActive ? 0.4 : 1,
                      animation: inView ? `barGrow 0.7s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms forwards` : "none",
                      transform: inView ? "scaleY(1)" : "scaleY(0)",
                      transformOrigin: "bottom",
                    }} />
                )}
              </div>
              {/* Product count badge */}
              {hasProducts && (
                <span className="text-[10px] tabular-nums font-medium"
                  style={{ color: isActive ? ORANGE : MUTED }}>
                  {b.items.length}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-1.5 mb-5">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[9px] tabular-nums block" style={{ color: MUTED }}>₹{b.from}</span>
          </div>
        ))}
      </div>

      {/* Revenue labels on y-axis hint */}
      <div className="flex items-center justify-between text-[10px] mb-4" style={{ color: MUTED }}>
        <span>↑ Revenue/mo per band</span>
        <span>Peak: {fmtRev(maxRev)}</span>
      </div>

      {/* Expanded bucket products */}
      {activeBucketProducts.length > 0 && (
        <div className="rounded-xl overflow-hidden border animate-fade-up" style={{ borderColor: BORDER, animationDuration: "0.3s", animationFillMode: "both" }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: BORDER, background: BG }}>
            <span className="text-xs font-semibold">₹{buckets[activeBucket!].from} – ₹{buckets[activeBucket!].to}</span>
            <span className="text-xs" style={{ color: MUTED }}>{activeBucketProducts.length} products · {fmtRev(buckets[activeBucket!].totalRev)}/mo combined</span>
          </div>
          {activeBucketProducts.map((p, i) => (
            <div key={p.asin} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0"
              style={{ borderColor: BORDER, background: i % 2 === 0 ? "white" : BG }}>
              <span className="text-xs font-bold tabular-nums w-5 shrink-0" style={{ color: ORANGE }}>#{p.rank}</span>
              <span className="text-xs flex-1 truncate">{p.title.slice(0, 60)}{p.title.length > 60 ? "…" : ""}</span>
              <span className="text-xs tabular-nums shrink-0" style={{ color: MUTED }}>₹{p.price}</span>
              <span className="text-xs tabular-nums shrink-0 font-medium">{fmtRev(p.monthlyRevenue ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── 4. Customer Voice ──────────────────────────────────────────────────────────
function CustomerVoice({ insights }: { insights: MarketReport["report"]["reviewInsights"] }) {
  const { ref, inView } = useInView();
  const { topPraise, topComplaints, purchaseCriteria, sentiment } = insights;
  const hasData = topPraise.length > 0 || topComplaints.length > 0;

  if (!hasData) return null;

  return (
    <div ref={ref} className="space-y-4">
      {/* Sentiment banner */}
      {sentiment && (
        <div className="rounded-xl px-5 py-3 flex items-start gap-3 border" style={{ background: "white", borderColor: BORDER }}>
          <span className="text-lg shrink-0">💬</span>
          <p className="text-sm leading-relaxed">{sentiment}</p>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        {/* Love */}
        <Card className="p-5 sm:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">✦</span>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#166534" }}>They love</span>
          </div>
          <ul className="space-y-3">
            {topPraise.map((item, i) => (
              <li key={i} className="flex gap-2.5 items-start text-sm"
                style={{ opacity: inView ? 1 : 0, animation: inView ? `fadeUp 0.4s ease ${i * 80}ms both` : "none" }}>
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#22C55E" }} />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        {/* Complaints */}
        <Card className="p-5 sm:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">✕</span>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#991B1B" }}>They hate</span>
          </div>
          <ul className="space-y-3">
            {topComplaints.map((item, i) => (
              <li key={i} className="flex gap-2.5 items-start text-sm"
                style={{ opacity: inView ? 1 : 0, animation: inView ? `fadeUp 0.4s ease ${i * 80}ms both` : "none" }}>
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        {/* Purchase criteria */}
        <Card className="p-5 sm:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">↓</span>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Why they buy</span>
          </div>
          <ol className="space-y-3">
            {purchaseCriteria.map((item, i) => (
              <li key={i} className="flex gap-3 items-start text-sm"
                style={{ opacity: inView ? 1 : 0, animation: inView ? `fadeUp 0.4s ease ${i * 80}ms both` : "none" }}>
                <span className="text-lg font-bold tabular-nums leading-none shrink-0"
                  style={{ color: i === 0 ? ORANGE : i === 1 ? "#0A0A0A" : "#C4B8AC" }}>
                  {i + 1}
                </span>
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

// ── 5. Opportunities ───────────────────────────────────────────────────────────
function OpportunityCards({ opportunities }: { opportunities: string[] }) {
  const { ref, inView } = useInView();

  return (
    <Card className="p-6" ref={ref as React.RefObject<HTMLDivElement>} style={{ borderColor: "#FBDACC", background: "#FFFAF7" }}>
      <Label>Opportunities</Label>
      <div className="space-y-3">
        {opportunities.map((item, i) => (
          <div key={i} className="flex gap-3 p-3 rounded-xl transition-all"
            style={{
              background: "white",
              border: `1px solid ${BORDER}`,
              opacity: inView ? 1 : 0,
              animation: inView ? `fadeUp 0.4s ease ${i * 100}ms both` : "none",
            }}>
            <span className="text-xs font-bold tabular-nums shrink-0 h-5 w-5 rounded flex items-center justify-center text-white"
              style={{ background: ORANGE, fontSize: "10px" }}>{i + 1}</span>
            <p className="text-sm leading-snug">{item}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 6. Entry + Risk ────────────────────────────────────────────────────────────
function EntryAndRisk({ rec, risks }: { rec: string; risks: string[] }) {
  const { ref, inView } = useInView();

  return (
    <div ref={ref} className="space-y-4">
      {/* Entry recommendation */}
      <div className="rounded-2xl p-6 border-l-4" style={{ background: "#0A0A0A", borderLeftColor: ORANGE }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: ORANGE }}>Entry Strategy</p>
        <p className="text-sm leading-relaxed text-white">{rec}</p>
      </div>

      {/* Risks */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm">⚠</span>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: MUTED }}>Risk Factors</span>
        </div>
        <div className="space-y-2">
          {risks.map((r, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg"
              style={{
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                opacity: inView ? 1 : 0,
                animation: inView ? `fadeUp 0.4s ease ${i * 80}ms both` : "none",
              }}>
              <span className="mt-0.5 text-amber-500 shrink-0 text-xs font-bold">{i + 1}</span>
              <p className="text-xs leading-snug text-amber-900">{r}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── 7. Rising Stars ────────────────────────────────────────────────────────────
function RisingStars({ entrants }: { entrants: MarketReport["newEntrants"] }) {
  const { ref, inView } = useInView();

  return (
    <Card className="p-6" ref={ref as React.RefObject<HTMLDivElement>}>
      <Label>Rising Stars — High Rank, Low Reviews</Label>
      <p className="text-xs mb-5" style={{ color: MUTED }}>Products that reached the top without social proof — new entrants you should watch.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {entrants.map((p, i) => (
          <div key={p.asin} className="flex items-center gap-4 p-4 rounded-xl border"
            style={{
              borderColor: BORDER,
              background: BG,
              opacity: inView ? 1 : 0,
              animation: inView ? `fadeUp 0.4s ease ${i * 80}ms both` : "none",
            }}>
            {/* Rank badge */}
            <div className="shrink-0 text-center">
              <div className="text-2xl font-bold leading-none tabular-nums" style={{ color: ORANGE }}>#{p.rank}</div>
              <div className="text-[10px] font-medium" style={{ color: MUTED }}>rank</div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{p.title.slice(0, 55)}{p.title.length > 55 ? "…" : ""}</p>
              <div className="flex gap-3 mt-1.5">
                {p.price && <span className="text-xs" style={{ color: MUTED }}>₹{p.price}</span>}
                {p.rating && <span className="text-xs" style={{ color: MUTED }}>{p.rating}★</span>}
                <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: "#FDF0EA", color: ORANGE }}>
                  {p.reviewCount} reviews
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 8. Sortable Product Table ──────────────────────────────────────────────────
type SortKey = "rank" | "price" | "rating" | "reviewCount" | "monthlySales" | "monthlyRevenue";
type SortDir = "asc" | "desc";

function ProductTable({ products }: { products: EnrichedProduct[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("monthlyRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...products].sort((a, b) => {
    const av = (a[sortKey] ?? 0) as number;
    const bv = (b[sortKey] ?? 0) as number;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const Arrow = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span style={{ color: BORDER }}>↕</span>;
    return <span style={{ color: ORANGE }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const headers: { key: SortKey; label: string; right?: boolean }[] = [
    { key: "rank",           label: "Rank" },
    { key: "price",          label: "Price",       right: true },
    { key: "rating",         label: "Rating",      right: true },
    { key: "reviewCount",    label: "Reviews",     right: true },
    { key: "monthlySales",   label: "Sales/mo",    right: true },
    { key: "monthlyRevenue", label: "Rev/mo",      right: true },
  ];

  return (
    <Card className="p-6">
      <Label>All {products.length} Products</Label>
      <p className="text-xs mb-5" style={{ color: MUTED }}>Click any column header to sort. Default: revenue descending.</p>
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: BORDER }}>
              {/* Product col — not sortable */}
              <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wide pr-3" style={{ color: MUTED }}>Product</th>
              {headers.map(h => (
                <th key={h.key}
                  onClick={() => handleSort(h.key)}
                  className={`pb-3 text-xs font-semibold uppercase tracking-wide sort-header select-none ${h.right ? "text-right" : ""}`}
                  style={{ color: sortKey === h.key ? ORANGE : MUTED }}>
                  {h.label} <Arrow col={h.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const isTop = p.rank <= 5;
              return (
                <tr key={p.asin}
                  className="border-b transition-colors hover:bg-[#FAF8F4] group"
                  style={{ borderColor: BORDER }}>
                  {/* Product */}
                  <td className="py-3 pr-4 max-w-[260px]">
                    <div className="flex items-center gap-2">
                      {isTop && (
                        <span className="shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: ORANGE }} />
                      )}
                      <a href={`https://www.amazon.in/dp/${p.asin}`} target="_blank" rel="noopener noreferrer"
                        className="hover:underline truncate text-xs leading-snug"
                        style={{ textDecorationColor: ORANGE }}>
                        {p.title.slice(0, 65)}{p.title.length > 65 ? "…" : ""}
                      </a>
                    </div>
                  </td>
                  <td className="py-3 text-right tabular-nums text-xs" style={{ color: sortKey === "rank" ? "#0A0A0A" : MUTED }}>
                    #{p.rank}
                  </td>
                  <td className="py-3 text-right tabular-nums text-xs">{p.price ? `₹${p.price}` : "—"}</td>
                  <td className="py-3 text-right tabular-nums text-xs">{p.rating ? `${p.rating}★` : "—"}</td>
                  <td className="py-3 text-right tabular-nums text-xs" style={{ color: MUTED }}>
                    {p.reviewCount?.toLocaleString("en-IN") ?? "—"}
                  </td>
                  <td className="py-3 text-right tabular-nums text-xs">{fmtNum(p.monthlySales)}</td>
                  <td className="py-3 text-right tabular-nums text-xs font-semibold"
                    style={{ color: sortKey === "monthlyRevenue" ? ORANGE : "#0A0A0A" }}>
                    {p.monthlyRevenue ? fmtRev(p.monthlyRevenue) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-center mt-5" style={{ color: "#C4B8AC" }}>
        Revenue estimates are directional, based on BSR–sales heuristics · Powered by{" "}
        <span style={{ color: ORANGE }}>Pixii</span>
      </p>
    </Card>
  );
}
