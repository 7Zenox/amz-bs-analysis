import { newContext, sleep } from "./browser";

export interface BestSellerItem {
  rank: number;
  asin: string;
  title: string;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
}

export async function scrapeBestSellers(url: string): Promise<BestSellerItem[]> {
  const ctx = await newContext();
  const page = await ctx.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("[data-asin]", { timeout: 15000 }).catch(() => {});
    await sleep(1000);

    const items = await page.evaluate(() => {
      const results: Array<{
        asin: string;
        title: string;
        price: number | null;
        rating: number | null;
        reviewCount: number | null;
        imageUrl: string | null;
      }> = [];

      document.querySelectorAll("[data-asin]").forEach((card, i) => {
        const asin = card.getAttribute("data-asin") ?? "";
        if (!asin || asin.length < 5) return;

        const titleEl = card.querySelector(
          ".p13n-sc-truncated, ._cDEzb_p13n-sc-css-line-clamp-3_g3dy1, [class*='p13n-sc-truncated'], [class*='line-clamp']"
        );
        const title = titleEl?.textContent?.trim() ?? "";
        if (!title) return;

        const priceEl = card.querySelector(".p13n-sc-price, [class*='p13n-sc-price'], .a-price .a-offscreen");
        const priceText = priceEl?.textContent?.trim().replace(/[₹,\s]/g, "") ?? "";
        const price = priceText ? parseFloat(priceText) : null;

        const ratingEl = card.querySelector("[aria-label*='out of 5 stars'], .a-icon-star-small .a-icon-alt");
        const ratingText = ratingEl?.getAttribute("aria-label") ?? ratingEl?.textContent ?? "";
        const ratingMatch = ratingText.match(/^([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        const reviewEl = card.querySelector(".a-size-small, [class*='number-of-reviews']");
        const reviewText = reviewEl?.textContent?.trim().replace(/,/g, "") ?? "";
        const reviewCount = /^\d+/.test(reviewText) ? parseInt(reviewText) : null;

        const imgEl = card.querySelector("img");
        const imageUrl = imgEl?.getAttribute("src") ?? null;

        results.push({ asin, title, price, rating, reviewCount, imageUrl });
      });

      return results;
    });

    return items.map((item, i) => ({ rank: i + 1, ...item }));
  } finally {
    await ctx.close();
  }
}
