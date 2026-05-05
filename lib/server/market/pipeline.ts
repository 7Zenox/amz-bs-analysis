import { scrapeBestSellers } from "../scraper/bestSellers";
import { scrapeProductPage, type ProductDetail } from "../scraper/productPage";
import { scrapeReviews, type Review } from "../scraper/reviews";
import { enrichProducts, attachReviews, computeMarketStats, computeBrandStats, findPriceGaps, findNewEntrants, type EnrichedProduct } from "./analysis";
import { generateReviewInsights, generateOpportunityReport, type OpportunityReport } from "./nemotronReport";
import { sleep } from "../scraper/browser";

export type ProgressStage =
  | "scraping_bestsellers"
  | "scraping_products"
  | "scraping_reviews"
  | "analyzing"
  | "done"
  | "error";

export interface ProgressUpdate {
  stage: ProgressStage;
  message: string;
  pct: number;
}

export interface MarketReport {
  url: string;
  categoryName: string;
  scrapedAt: string;
  products: EnrichedProduct[];
  stats: ReturnType<typeof computeMarketStats>;
  brands: ReturnType<typeof computeBrandStats>;
  priceGaps: ReturnType<typeof findPriceGaps>;
  newEntrants: ReturnType<typeof findNewEntrants>;
  report: OpportunityReport;
}

function extractCategoryName(url: string): string {
  // Try to extract from URL path segments
  const match = url.match(/bestsellers\/([^/?#]+)/i) ?? url.match(/\/([^/?#]+)\/?(?:\?|$)/);
  if (!match) return "Unknown Category";
  return match[1]
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function extractDomain(url: string): string {
  const match = url.match(/amazon\.([\w.]+)/);
  return match ? `amazon.${match[1]}` : "amazon.in";
}

export async function runMarketPipeline(
  url: string,
  onProgress: (update: ProgressUpdate) => void,
  opts: { topN?: number; reviewPages?: number } = {}
): Promise<MarketReport> {
  const { topN = 30, reviewPages = 2 } = opts;
  const domain = extractDomain(url);
  const categoryName = extractCategoryName(url);

  // Stage 1: Best sellers
  onProgress({ stage: "scraping_bestsellers", message: `Scraping top ${topN} sellers…`, pct: 5 });
  const sellers = await scrapeBestSellers(url);
  const topSellers = sellers.slice(0, topN);

  if (topSellers.length === 0) throw new Error("No products found on best sellers page");

  // Stage 2: Product pages (top 15 for detail)
  const detailTarget = topSellers.slice(0, 15);
  const detailMap = new Map<string, ProductDetail>();

  for (let i = 0; i < detailTarget.length; i++) {
    const p = detailTarget[i];
    onProgress({
      stage: "scraping_products",
      message: `Fetching product details ${i + 1}/${detailTarget.length}: ${p.title.slice(0, 50)}…`,
      pct: 10 + Math.round((i / detailTarget.length) * 35),
    });
    try {
      const detail = await scrapeProductPage(p.asin, domain);
      detailMap.set(p.asin, detail);
    } catch {
      // Non-fatal — continue without detail for this product
    }
    if (i < detailTarget.length - 1) await sleep(800);
  }

  let products = enrichProducts(topSellers, detailMap);

  // Stage 3: Reviews (top 8 products)
  const reviewTargets = topSellers.slice(0, 8);
  const reviewMap = new Map<string, Review[]>();

  for (let i = 0; i < reviewTargets.length; i++) {
    const p = reviewTargets[i];
    onProgress({
      stage: "scraping_reviews",
      message: `Scraping reviews ${i + 1}/${reviewTargets.length}: ${p.title.slice(0, 50)}…`,
      pct: 45 + Math.round((i / reviewTargets.length) * 30),
    });
    try {
      const reviews = await scrapeReviews(p.asin, domain, reviewPages);
      reviewMap.set(p.asin, reviews);
    } catch {
      // Non-fatal
    }
    if (i < reviewTargets.length - 1) await sleep(1000);
  }

  products = attachReviews(products, reviewMap);

  // Stage 4: Analysis
  onProgress({ stage: "analyzing", message: "Analyzing market data with AI…", pct: 78 });
  const stats = computeMarketStats(products);
  const brands = computeBrandStats(products);
  const priceGaps = findPriceGaps(products);
  const newEntrants = findNewEntrants(products);

  onProgress({ stage: "analyzing", message: "Mining customer reviews…", pct: 85 });
  const reviewInsights = await generateReviewInsights(products);

  onProgress({ stage: "analyzing", message: "Generating opportunity report…", pct: 92 });
  const report = await generateOpportunityReport(categoryName, stats, brands, priceGaps, newEntrants, reviewInsights, products);

  onProgress({ stage: "done", message: "Analysis complete", pct: 100 });

  return {
    url,
    categoryName,
    scrapedAt: new Date().toISOString(),
    products,
    stats,
    brands,
    priceGaps,
    newEntrants,
    report,
  };
}
