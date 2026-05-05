import { parse } from "node-html-parser";
import { amazonFetch } from "./browser";

export interface BsrEntry {
  rank: number;
  category: string;
}

export interface ProductDetail {
  asin: string;
  title: string;
  brand: string | null;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  bulletPoints: string[];
  bsrEntries: BsrEntry[];
  starDistribution: { five: number; four: number; three: number; two: number; one: number } | null;
  frequentlyBoughtWith: string[];
  questionCount: number | null;
  availability: string | null;
}

function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[₹$€£,\s]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

export async function scrapeProductPage(asin: string, domain = "amazon.in"): Promise<ProductDetail> {
  const html = await amazonFetch(`https://www.${domain}/dp/${asin}`);
  const root = parse(html);

  const title = root.querySelector("#productTitle")?.text?.trim() ?? "";

  const brand =
    root.querySelector("#bylineInfo")?.text?.trim()
      .replace(/^(Brand:|Visit the|Store)[\s]*/i, "")
      .trim() ?? null;

  const priceEl =
    root.querySelector(".a-price.priceToPay .a-offscreen") ??
    root.querySelector("#priceblock_ourprice") ??
    root.querySelector("#priceblock_dealprice") ??
    root.querySelector(".a-price .a-offscreen");
  const price = priceEl ? parsePrice(priceEl.text) : null;

  const ratingEl = root.querySelector("#acrPopover");
  const ratingText = ratingEl?.getAttribute("title") ?? "";
  const ratingMatch = ratingText.match(/([\d.]+)\s*out of/i);
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

  const reviewEl = root.querySelector("#acrCustomerReviewText");
  const reviewText = reviewEl?.text?.replace(/,/g, "") ?? "";
  const reviewMatch = reviewText.match(/\d+/);
  const reviewCount = reviewMatch ? parseInt(reviewMatch[0]) : null;

  const bulletPoints = root
    .querySelectorAll("#feature-bullets li span.a-list-item")
    .map(el => el.text?.trim() ?? "")
    .filter(t => t.length > 5 && !t.toLowerCase().includes("make sure"));

  const bsrEntries: BsrEntry[] = [];
  root.querySelectorAll("#detailBulletsWrapper_feature_div li, #detailBullets_feature_div li").forEach(li => {
    const text = li.text ?? "";
    if (text.toLowerCase().includes("best seller") || text.toLowerCase().includes("rank")) {
      const matches = [...text.matchAll(/#([\d,]+)\s+in\s+([^(#\n]+)/gi)];
      for (const m of matches) {
        const rank = parseInt(m[1].replace(/,/g, ""));
        const category = m[2].trim().replace(/\s+/g, " ");
        if (!isNaN(rank)) bsrEntries.push({ rank, category });
      }
    }
  });

  const histRows = root.querySelectorAll("#histogramTable tr, .a-histogram-row");
  let starDistribution = null;
  if (histRows.length >= 5) {
    const pcts: number[] = [];
    histRows.forEach(row => {
      const ariaLabel = row.querySelector("[aria-label]")?.getAttribute("aria-label") ?? "";
      const pct = parseFloat(ariaLabel.replace(/[^0-9.]/g, "")) || 0;
      pcts.push(pct);
    });
    if (pcts.length >= 5) {
      starDistribution = { five: pcts[0], four: pcts[1], three: pcts[2], two: pcts[3], one: pcts[4] };
    }
  }

  const fbt: string[] = [];
  root.querySelectorAll("[data-asin]").forEach(el => {
    const a = el.getAttribute("data-asin");
    if (a && a !== asin && a.length >= 5) fbt.push(a);
  });

  const qaEl = root.querySelector("#askATFLink");
  const qaText = qaEl?.text?.trim() ?? "";
  const qaMatch = qaText.match(/([\d,]+)/);
  const questionCount = qaMatch ? parseInt(qaMatch[1].replace(/,/g, "")) : null;

  const availability = root.querySelector("#availability span")?.text?.trim() ?? null;

  return {
    asin, title, brand, price, rating, reviewCount, bulletPoints,
    bsrEntries, starDistribution, frequentlyBoughtWith: [...new Set(fbt)].slice(0, 5),
    questionCount, availability,
  };
}
