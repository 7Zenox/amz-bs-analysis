import { newContext, sleep } from "./browser";

export interface StarDistribution {
  five: number;
  four: number;
  three: number;
  two: number;
  one: number;
}

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
  starDistribution: StarDistribution | null;
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
  const ctx = await newContext();
  const page = await ctx.newPage();
  const url = `https://www.${domain}/dp/${asin}`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(800);

    const detail = await page.evaluate((asin: string) => {
      // Title
      const title = document.querySelector("#productTitle")?.textContent?.trim() ?? "";

      // Brand
      const brand =
        document.querySelector("#bylineInfo, #brand, [data-feature-name='bylineInfo'] a")?.textContent?.trim().replace(/^(Brand:|Visit the|Store)[\s]*/i, "") ?? null;

      // Price
      const priceEl = document.querySelector(".a-price.priceToPay .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen");
      const price = priceEl?.textContent?.trim() ?? null;

      // Rating
      const ratingEl = document.querySelector("#acrPopover, [data-hook='rating-out-of-text']");
      const ratingText = ratingEl?.getAttribute("title") ?? ratingEl?.textContent ?? "";
      const ratingMatch = ratingText.match(/([\d.]+)\s*out of/i);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      // Review count
      const reviewEl = document.querySelector("#acrCustomerReviewText, [data-hook='total-review-count']");
      const reviewText = reviewEl?.textContent?.replace(/,/g, "") ?? "";
      const reviewMatch = reviewText.match(/[\d]+/);
      const reviewCount = reviewMatch ? parseInt(reviewMatch[0]) : null;

      // Bullet points
      const bulletPoints = Array.from(
        document.querySelectorAll("#feature-bullets li span.a-list-item, #productFactsDesktopExpander li span")
      )
        .map((el) => el.textContent?.trim() ?? "")
        .filter((t) => t.length > 5 && !t.toLowerCase().includes("make sure"));

      // BSR entries
      const bsrEntries: Array<{ rank: number; category: string }> = [];
      document.querySelectorAll("#detailBulletsWrapper_feature_div li, #detailBullets_feature_div li, .a-section.a-spacing-small li").forEach((li) => {
        const text = li.textContent ?? "";
        if (text.toLowerCase().includes("best seller") || text.toLowerCase().includes("rank")) {
          const matches = text.matchAll(/#([\d,]+)\s+in\s+([^(#\n]+)/gi);
          for (const m of matches) {
            const rank = parseInt(m[1].replace(/,/g, ""));
            const category = m[2].trim().replace(/\s+/g, " ");
            if (!isNaN(rank)) bsrEntries.push({ rank, category });
          }
        }
      });

      // Star distribution
      let starDistribution = null;
      const histRows = document.querySelectorAll("[data-hook='rating-histogram'] tr, #histogramTable tr, .a-histogram-row");
      if (histRows.length >= 5) {
        const pcts: number[] = [];
        histRows.forEach((row) => {
          const pctEl = row.querySelector(".a-text-right, [aria-label*='%'], .a-meter");
          const pctText = pctEl?.getAttribute("aria-label") ?? pctEl?.textContent ?? "0";
          const pct = parseFloat(pctText.replace(/[^0-9.]/g, "")) || 0;
          pcts.push(pct);
        });
        if (pcts.length >= 5) {
          starDistribution = { five: pcts[0], four: pcts[1], three: pcts[2], two: pcts[3], one: pcts[4] };
        }
      }

      // Frequently bought together
      const fbt: string[] = [];
      document.querySelectorAll("[data-asin][class*='fbt'], #sims-fbt [data-asin]").forEach((el) => {
        const a = el.getAttribute("data-asin");
        if (a && a !== asin && a.length >= 5) fbt.push(a);
      });

      // Q&A count
      const qaEl = document.querySelector("#askATFLink, #questionsSummary");
      const qaText = qaEl?.textContent?.trim() ?? "";
      const qaMatch = qaText.match(/([\d,]+)/);
      const questionCount = qaMatch ? parseInt(qaMatch[1].replace(/,/g, "")) : null;

      // Availability
      const availability = document.querySelector("#availability span")?.textContent?.trim() ?? null;

      return { title, brand, price, rating, reviewCount, bulletPoints, bsrEntries, starDistribution, frequentlyBoughtWith: fbt, questionCount, availability };
    }, asin);

    return {
      asin,
      ...detail,
      price: detail.price ? parsePrice(detail.price) : null,
    };
  } finally {
    await ctx.close();
  }
}
