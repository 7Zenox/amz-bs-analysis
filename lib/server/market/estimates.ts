/**
 * BSR → estimated monthly sales.
 * Power-law decay calibrated for Amazon India (roughly 30% below US estimates).
 * Constants are empirically tuned — not guaranteed accurate but directionally useful.
 */
export function bsrToMonthlySales(rank: number): number {
  if (rank <= 0) return 0;
  const A = 3000;
  const B = 0.65;
  return Math.round(A / Math.pow(rank, B));
}

export function estimateRevenue(rank: number, price: number | null): number | null {
  if (price == null) return null;
  return Math.round(bsrToMonthlySales(rank) * price);
}

export interface RevenueEstimate {
  monthlySales: number;
  monthlyRevenue: number | null;
  annualRevenue: number | null;
}

export function getEstimates(rank: number, price: number | null): RevenueEstimate {
  const monthlySales = bsrToMonthlySales(rank);
  const monthlyRevenue = price != null ? Math.round(monthlySales * price) : null;
  const annualRevenue = monthlyRevenue != null ? monthlyRevenue * 12 : null;
  return { monthlySales, monthlyRevenue, annualRevenue };
}
