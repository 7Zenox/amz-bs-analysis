# Pixii — Market Intelligence

Paste any Amazon Best Sellers URL and get a full market intelligence report: revenue estimates, brand landscape, price gaps, customer insights, and an AI-written entry strategy.

## What It Does

1. **Scrapes** the top 30 products from any Amazon Best Sellers page
2. **Deep-dives** 15 product pages for bullet points, BSR, brand data
3. **Mines** inline customer reviews from the top 8 products
4. **Analyses** everything with Nemotron (NVIDIA) to produce a structured report

## Stack

- **Framework**: Next.js 16 App Router (TypeScript, Tailwind v4)
- **Scraping**: `fetch` + `node-html-parser` — no browser, works on any serverless platform
- **AI**: NVIDIA Nemotron (`nvidia/nemotron-nano-12b-v2-vl`) via NVIDIA Inference API
- **Deployment**: Vercel

## Quick Start

```bash
npm install
cp .env.local.example .env.local   # add your NVIDIA_API_KEY
npm run dev
```

Open [http://localhost:3000/market](http://localhost:3000/market)

## Environment Variables

Only one secret is required:

```
NVIDIA_API_KEY=nvapi-...
```

Everything else (model name, API base URL) is hardcoded in `lib/server/nvidiaClient.ts`.

## Project Structure

```
app/
  market/page.tsx          # UI — input, progress, full report
  api/market/route.ts      # SSE endpoint — streams progress then result

lib/server/
  nvidiaClient.ts          # Nemotron chat + structured JSON helpers
  scraper/
    browser.ts             # amazonFetch() with proper headers
    bestSellers.ts         # Scrapes the Best Sellers grid
    productPage.ts         # Scrapes individual product pages
    reviews.ts             # Scrapes inline reviews from product pages
  market/
    estimates.ts           # BSR → monthly sales/revenue heuristics
    analysis.ts            # Brand stats, price gaps, new entrant detection
    nemotronReport.ts      # Nemotron prompts for review insights + opportunity report
    pipeline.ts            # Orchestrates all stages, emits progress events
```

## Report Sections

| Section | How it's built |
|---|---|
| Market Snapshot | Aggregated revenue from BSR → sales estimates |
| Brand Dominance | Revenue share per brand, animated bar chart |
| Price Landscape | Histogram of revenue by price bucket, click to drill down |
| Customer Voice | Nemotron analysis of scraped inline reviews |
| Opportunities | Nemotron synthesis of gaps, complaints, and price bands |
| Entry Strategy | Nemotron recommendation grounded in the data |
| Rising Stars | Products ranked high with few reviews (new entrants) |
| Products Table | All 30 products, sortable by any column |

## Revenue Estimates

Sales estimates use a power-law BSR decay (`sales = 3000 / rank^0.65`), tuned for Amazon India. Numbers are directional — useful for comparing relative market size, not accounting forecasts.

## Deployment

Deploy to Vercel with one click. No special configuration needed — scraping uses `fetch` so there are no binary dependencies or Lambda layers required. Set `NVIDIA_API_KEY` in the Vercel dashboard.

The `/api/market` route uses SSE streaming with `maxDuration = 300` — works on Vercel Pro.
