import { parse } from "node-html-parser";
import { amazonFetch } from "./browser";

export interface Review {
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  helpfulVotes: number;
  date: string;
}

export async function scrapeReviews(asin: string, domain = "amazon.in", _maxPages = 3): Promise<Review[]> {
  // Inline reviews on the product page are server-rendered and accessible without a browser
  const html = await amazonFetch(`https://www.${domain}/dp/${asin}`);
  const root = parse(html);
  const reviews: Review[] = [];

  root.querySelectorAll("[data-hook='review']").forEach(card => {
    const ratingEl =
      card.querySelector("[data-hook='review-star-rating'] .a-icon-alt") ??
      card.querySelector("[data-hook='reviewStars'] .a-icon-alt") ??
      card.querySelector("[data-hook='cmps-review-star-rating'] .a-icon-alt");
    const ratingText = ratingEl?.text ?? "";
    const ratingMatch = ratingText.match(/^([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;

    const title =
      card.querySelector("[data-hook='review-title'] span:not([class*='icon'])")?.text?.trim() ??
      card.querySelector("[data-hook='reviewTitle'] span")?.text?.trim() ?? "";

    const body =
      card.querySelector("[data-hook='review-body'] span")?.text?.trim() ??
      card.querySelector("[data-hook='reviewText'] span")?.text?.trim() ??
      card.querySelector("[data-hook='reviewTextContainer'] span")?.text?.trim() ?? "";

    const verified = card.querySelector("[data-hook='avp-badge']") != null;

    const helpfulText = card.querySelector("[data-hook='helpful-vote-statement']")?.text ?? "0";
    const helpfulMatch = helpfulText.match(/(\d+)/);
    const helpfulVotes = helpfulMatch ? parseInt(helpfulMatch[1]) : 0;

    const date = card.querySelector("[data-hook='review-date']")?.text?.trim() ?? "";

    if (body.length > 15 && rating > 0) {
      reviews.push({ rating, title, body, verified, helpfulVotes, date });
    }
  });

  return reviews;
}
