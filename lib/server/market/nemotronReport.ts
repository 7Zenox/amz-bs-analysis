import { chat } from "../nvidiaClient";
import type { EnrichedProduct } from "./analysis";
import type { BrandStat, PriceGap, MarketStats } from "./analysis";
import type { Review } from "../scraper/reviews";

export interface ReviewInsights {
  topPraise: string[];
  topComplaints: string[];
  purchaseCriteria: string[];
  sentiment: string;
}

export interface OpportunityReport {
  marketNarrative: string;
  reviewInsights: ReviewInsights;
  opportunities: string[];
  entryRecommendation: string;
  riskFactors: string[];
}

function buildReviewContext(products: EnrichedProduct[]): string {
  const lines: string[] = [];
  for (const p of products.slice(0, 10)) {
    if (p.reviews.length === 0) continue;
    const sample = p.reviews.slice(0, 15);
    lines.push(`\nProduct (rank #${p.rank}, ${p.rating}★, ${p.reviewCount} reviews): ${p.title.slice(0, 80)}`);
    for (const r of sample) {
      lines.push(`  [${r.rating}★${r.verified ? " ✓" : ""}] ${r.body.slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}

export async function generateReviewInsights(products: EnrichedProduct[]): Promise<ReviewInsights> {
  const reviewContext = buildReviewContext(products);
  if (!reviewContext.trim()) {
    return { topPraise: [], topComplaints: [], purchaseCriteria: [], sentiment: "Insufficient review data" };
  }

  const prompt = `You are a market research analyst. Analyze these Amazon customer reviews and extract structured insights.

${reviewContext}

Respond ONLY with this JSON (no markdown, no explanation):
{
  "topPraise": ["<3-5 specific things customers love, each a short phrase>"],
  "topComplaints": ["<3-5 specific recurring complaints, each a short phrase>"],
  "purchaseCriteria": ["<3-5 key factors driving purchase decisions, most important first>"],
  "sentiment": "<one sentence overall sentiment summary>"
}`;

  const raw = await chat([{ role: "user", content: prompt }], { temperature: 0.2, maxTokens: 600 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]) as ReviewInsights;
  } catch {
    return { topPraise: [], topComplaints: [], purchaseCriteria: [], sentiment: raw.slice(0, 200) };
  }
}

export async function generateOpportunityReport(
  categoryName: string,
  stats: MarketStats,
  brands: BrandStat[],
  priceGaps: PriceGap[],
  newEntrants: { title: string; rank: number; reviewCount: number | null }[],
  reviewInsights: ReviewInsights,
  topProducts: EnrichedProduct[],
): Promise<OpportunityReport> {
  const topBrands = brands.slice(0, 5).map((b) => `${b.brand} (${b.revenueShare}% share, ${b.productCount} products, avg ${b.avgRating}★)`).join("; ");
  const gapSummary = priceGaps.map((g) => `₹${g.from}-${g.to} (${g.playerCount} sellers)`).join(", ") || "None identified";
  const newEntrantSummary = newEntrants.map((n) => `${n.title.slice(0, 60)} (rank #${n.rank}, ${n.reviewCount} reviews)`).join("; ") || "None";
  const topProductSummary = topProducts.slice(0, 5).map((p) =>
    `#${p.rank}: ${p.title.slice(0, 60)} | ₹${p.price ?? "?"} | ${p.rating}★ | ~${p.monthlySales} sales/mo`
  ).join("\n");

  const prompt = `You are a senior market analyst preparing a competitive intelligence report for a product entrepreneur.

MARKET: ${categoryName}
ESTIMATED MONTHLY REVENUE (top ${stats.productCount} sellers): ₹${stats.totalMonthlyRevenue.toLocaleString("en-IN")}
ANNUAL ESTIMATE: ₹${stats.totalAnnualRevenue.toLocaleString("en-IN")}
PRICE RANGE: ₹${stats.priceMin ?? "?"} – ₹${stats.priceMax ?? "?"}  |  AVG PRICE: ₹${stats.avgPrice ?? "?"}
AVG RATING: ${stats.avgRating ?? "?"}★

TOP BRANDS:
${topBrands}

TOP PRODUCTS:
${topProductSummary}

PRICE GAPS (underserved price bands):
${gapSummary}

FAST-RISING NEW ENTRANTS (high rank, low reviews):
${newEntrantSummary}

CUSTOMER REVIEW INSIGHTS:
- What they love: ${reviewInsights.topPraise.join("; ")}
- What they complain about: ${reviewInsights.topComplaints.join("; ")}
- Key purchase criteria: ${reviewInsights.purchaseCriteria.join("; ")}
- Overall: ${reviewInsights.sentiment}

Write a sharp, actionable market intelligence report. Be specific — avoid generic MBA language.

Respond ONLY with this JSON:
{
  "marketNarrative": "<2-3 sentences: what's happening in this market right now, who dominates and why>",
  "opportunities": ["<3-5 specific, actionable opportunities based on the data above>"],
  "entryRecommendation": "<2-3 sentences: if someone were entering this market today, what specific product positioning and price point would give the best chance of success>",
  "riskFactors": ["<2-4 genuine risks: incumbent moats, margin pressure, seasonality, etc.>"]
}`;

  const raw = await chat([{ role: "user", content: prompt }], { temperature: 0.3, maxTokens: 1200 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);
    return { ...parsed, reviewInsights };
  } catch {
    return {
      marketNarrative: raw.slice(0, 500),
      reviewInsights,
      opportunities: [],
      entryRecommendation: "",
      riskFactors: [],
    };
  }
}
