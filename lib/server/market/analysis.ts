import type { BestSellerItem } from "../scraper/bestSellers";
import type { ProductDetail } from "../scraper/productPage";
import type { Review } from "../scraper/reviews";
import { getEstimates } from "./estimates";

export interface EnrichedProduct extends BestSellerItem {
  monthlySales: number;
  monthlyRevenue: number | null;
  detail: ProductDetail | null;
  reviews: Review[];
}

export interface BrandStat {
  brand: string;
  productCount: number;
  totalMonthlyRevenue: number;
  revenueShare: number;
  avgRating: number | null;
}

export interface PriceGap {
  from: number;
  to: number;
  playerCount: number;
}

export interface MarketStats {
  totalMonthlyRevenue: number;
  totalAnnualRevenue: number;
  avgPrice: number | null;
  avgRating: number | null;
  priceMin: number | null;
  priceMax: number | null;
  productCount: number;
}

export interface ReviewInsights {
  topPraise: string[];
  topComplaints: string[];
  purchaseCriteria: string[];
  verifiedRatio: number;
  avgHelpfulVotes: number;
}

export interface NewEntrant {
  asin: string;
  title: string;
  rank: number;
  reviewCount: number | null;
  rating: number | null;
  price: number | null;
}

export function computeMarketStats(products: EnrichedProduct[]): MarketStats {
  const revenues = products.map((p) => p.monthlyRevenue ?? 0);
  const totalMonthlyRevenue = revenues.reduce((a, b) => a + b, 0);
  const prices = products.map((p) => p.price).filter((p): p is number => p != null);
  const ratings = products.map((p) => p.rating).filter((r): r is number => r != null);

  return {
    totalMonthlyRevenue,
    totalAnnualRevenue: totalMonthlyRevenue * 12,
    avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
    avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    productCount: products.length,
  };
}

export function computeBrandStats(products: EnrichedProduct[]): BrandStat[] {
  const map = new Map<string, { revenue: number; count: number; ratings: number[] }>();

  for (const p of products) {
    const brand = p.detail?.brand?.trim() || inferBrand(p.title);
    if (!brand) continue;
    const entry = map.get(brand) ?? { revenue: 0, count: 0, ratings: [] };
    entry.revenue += p.monthlyRevenue ?? 0;
    entry.count += 1;
    if (p.rating) entry.ratings.push(p.rating);
    map.set(brand, entry);
  }

  const totalRevenue = products.reduce((s, p) => s + (p.monthlyRevenue ?? 0), 0);

  return Array.from(map.entries())
    .map(([brand, data]) => ({
      brand,
      productCount: data.count,
      totalMonthlyRevenue: data.revenue,
      revenueShare: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 1000) / 10 : 0,
      avgRating: data.ratings.length
        ? Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.totalMonthlyRevenue - a.totalMonthlyRevenue);
}

export function findPriceGaps(products: EnrichedProduct[]): PriceGap[] {
  const prices = products.map((p) => p.price).filter((p): p is number => p != null).sort((a, b) => a - b);
  if (prices.length < 2) return [];

  const gaps: PriceGap[] = [];
  const bucketSize = 200;
  const min = Math.floor(prices[0] / bucketSize) * bucketSize;
  const max = Math.ceil(prices[prices.length - 1] / bucketSize) * bucketSize;

  for (let from = min; from < max; from += bucketSize) {
    const to = from + bucketSize;
    const count = prices.filter((p) => p >= from && p < to).length;
    if (count <= 1) gaps.push({ from, to, playerCount: count });
  }

  return gaps;
}

export function findNewEntrants(products: EnrichedProduct[], maxReviews = 200): NewEntrant[] {
  return products
    .filter((p) => (p.reviewCount ?? 999999) <= maxReviews && p.rank <= 20)
    .map((p) => ({
      asin: p.asin,
      title: p.title,
      rank: p.rank,
      reviewCount: p.reviewCount,
      rating: p.rating,
      price: p.price,
    }));
}

function inferBrand(title: string): string {
  // First word of title is usually the brand
  return title.split(/[\s,]/)[0] ?? "Unknown";
}

export function enrichProducts(sellers: BestSellerItem[], details: Map<string, ProductDetail>): EnrichedProduct[] {
  return sellers.map((s) => {
    const detail = details.get(s.asin) ?? null;
    const price = detail?.price ?? s.price;
    const { monthlySales, monthlyRevenue } = getEstimates(s.rank, price);
    return { ...s, price, monthlySales, monthlyRevenue, detail, reviews: [] };
  });
}

export function attachReviews(products: EnrichedProduct[], reviewMap: Map<string, Review[]>): EnrichedProduct[] {
  return products.map((p) => ({ ...p, reviews: reviewMap.get(p.asin) ?? [] }));
}
