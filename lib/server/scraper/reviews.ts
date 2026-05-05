import { newContext, sleep } from "./browser";

export interface Review {
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  helpfulVotes: number;
  date: string;
}

/**
 * Scrapes the top reviews shown inline on the product page.
 * Amazon blocks direct /product-reviews/ URLs for headless browsers,
 * so we extract the 3-5 curated reviews Amazon surfaces on the dp/ page.
 */
export async function scrapeReviews(asin: string, domain = "amazon.in", _maxPages = 3): Promise<Review[]> {
  const ctx = await newContext();
  const page = await ctx.newPage();

  try {
    await page.goto(`https://www.${domain}/dp/${asin}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(800);

    return await page.evaluate(() => {
      const reviews: Review[] = [];

      // Inline top reviews on product page
      document.querySelectorAll("[data-hook='review'], .review, [id^='customer_review']").forEach((card) => {
        const ratingEl = card.querySelector(
          "[data-hook='review-star-rating'] .a-icon-alt, [data-hook='cmps-review-star-rating'] .a-icon-alt, [data-hook='reviewStars'] .a-icon-alt, .a-icon-star .a-icon-alt"
        );
        const ratingText = ratingEl?.textContent ?? "";
        const ratingMatch = ratingText.match(/^([\d.]+)/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

        // Amazon uses both dash and camelCase variants for data-hook
        const title =
          card.querySelector("[data-hook='review-title'] span:not(.a-icon-alt), [data-hook='reviewTitle'] span:not(.a-icon-alt)")
            ?.textContent?.trim() ?? "";
        const body =
          card.querySelector("[data-hook='review-body'] span, [data-hook='reviewText'] span, [data-hook='reviewTextContainer'] span, .review-text-content span")
            ?.textContent?.trim() ?? "";
        const verified = !!card.querySelector("[data-hook='avp-badge']");
        const helpfulText = card.querySelector("[data-hook='helpful-vote-statement']")?.textContent ?? "0";
        const helpfulMatch = helpfulText.match(/(\d+)/);
        const helpfulVotes = helpfulMatch ? parseInt(helpfulMatch[1]) : 0;
        const date = card.querySelector("[data-hook='review-date']")?.textContent?.trim() ?? "";

        if (body.length > 15 && rating > 0) {
          reviews.push({ rating, title, body, verified, helpfulVotes, date });
        }
      });

      return reviews;
    });
  } finally {
    await ctx.close();
  }
}
