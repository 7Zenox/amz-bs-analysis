import { parse } from "node-html-parser";
import { amazonFetch } from "./browser";

export interface BestSellerItem {
  rank: number;
  asin: string;
  title: string;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[₹$€£,\s]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

export async function scrapeBestSellers(url: string): Promise<BestSellerItem[]> {
  const html = await amazonFetch(url);
  const root = parse(html);
  const items: BestSellerItem[] = [];

  root.querySelectorAll("[data-asin]").forEach((card, i) => {
    const asin = card.getAttribute("data-asin") ?? "";
    if (!asin || asin.length < 5) return;

    const titleEl =
      card.querySelector(".p13n-sc-truncated") ??
      card.querySelector("[class*='p13n-sc-truncated']") ??
      card.querySelector("[class*='line-clamp']") ??
      card.querySelector("._cDEzb_p13n-sc-css-line-clamp-3_g3dy1");
    const title = titleEl?.text?.trim() ?? "";
    if (!title) return;

    const priceEl =
      card.querySelector(".p13n-sc-price") ??
      card.querySelector("[class*='p13n-sc-price']");
    const price = priceEl ? parsePrice(priceEl.text) : null;

    const ratingEl = card.querySelector("[aria-label*='out of 5 stars']");
    const ratingText = ratingEl?.getAttribute("aria-label") ?? "";
    const ratingMatch = ratingText.match(/^([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    const reviewEl = card.querySelector(".a-size-small");
    const reviewText = reviewEl?.text?.trim().replace(/,/g, "") ?? "";
    const reviewCount = /^\d+/.test(reviewText) ? parseInt(reviewText) : null;

    const imgEl = card.querySelector("img");
    const imageUrl = imgEl?.getAttribute("src") ?? null;

    items.push({ rank: i + 1, asin, title, price, rating, reviewCount, imageUrl });
  });

  return items;
}
