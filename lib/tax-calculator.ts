export type CalculationMode = "before-tax" | "after-tax" | "final-total";
export type BcPstTreatment = "standard" | "no-pst" | "custom";

export type Province = {
  name: string;
  abbreviation: string;
  gstRate: number;
  pstRate: number;
  qstRate: number;
  hstRate: number;
  reviewedDate: string;
};

// Rates are stored as millionths of the taxable subtotal: 5% = 50,000.
export const PROVINCES: Province[] = [
  { name: "Alberta", abbreviation: "AB", gstRate: 50_000, pstRate: 0, qstRate: 0, hstRate: 0, reviewedDate: "2026-07-16" },
  { name: "British Columbia", abbreviation: "BC", gstRate: 50_000, pstRate: 70_000, qstRate: 0, hstRate: 0, reviewedDate: "2026-07-16" },
  { name: "Manitoba", abbreviation: "MB", gstRate: 50_000, pstRate: 70_000, qstRate: 0, hstRate: 0, reviewedDate: "2026-07-16" },
  { name: "New Brunswick", abbreviation: "NB", gstRate: 0, pstRate: 0, qstRate: 0, hstRate: 150_000, reviewedDate: "2026-07-16" },
  { name: "Newfoundland and Labrador", abbreviation: "NL", gstRate: 0, pstRate: 0, qstRate: 0, hstRate: 150_000, reviewedDate: "2026-07-16" },
  { name: "Northwest Territories", abbreviation: "NT", gstRate: 50_000, pstRate: 0, qstRate: 0, hstRate: 0, reviewedDate: "2026-07-16" },
  { name: "Nova Scotia", abbreviation: "NS", gstRate: 0, pstRate: 0, qstRate: 0, hstRate: 140_000, reviewedDate: "2026-07-16" },
  { name: "Nunavut", abbreviation: "NU", gstRate: 50_000, pstRate: 0, qstRate: 0, hstRate: 0, reviewedDate: "2026-07-16" },
  { name: "Ontario", abbreviation: "ON", gstRate: 0, pstRate: 0, qstRate: 0, hstRate: 130_000, reviewedDate: "2026-07-16" },
  { name: "Prince Edward Island", abbreviation: "PE", gstRate: 0, pstRate: 0, qstRate: 0, hstRate: 150_000, reviewedDate: "2026-07-16" },
  { name: "Quebec", abbreviation: "QC", gstRate: 50_000, pstRate: 0, qstRate: 99_750, hstRate: 0, reviewedDate: "2026-07-16" },
  { name: "Saskatchewan", abbreviation: "SK", gstRate: 50_000, pstRate: 60_000, qstRate: 0, hstRate: 0, reviewedDate: "2026-07-16" },
  { name: "Yukon", abbreviation: "YT", gstRate: 50_000, pstRate: 0, qstRate: 0, hstRate: 0, reviewedDate: "2026-07-16" },
];

const SCALE = 1_000_000;

function roundDiv(numerator: bigint, denominator: bigint): number {
  return Number((numerator + denominator / 2n) / denominator);
}

function taxFromSubtotal(subtotalCents: number, rate: number): number {
  return roundDiv(BigInt(subtotalCents) * BigInt(rate), BigInt(SCALE));
}

export function parseMoney(value: string): { cents: number | null; error: boolean } {
  const raw = value.trim();
  if (!raw) return { cents: null, error: false };
  const normalized = raw.replaceAll("$", "").replaceAll(",", "").trim();
  if (!/^\d*(?:\.\d*)?$/.test(normalized) || normalized === ".") return { cents: null, error: true };
  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > 2) {
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0) return { cents: null, error: true };
    return { cents: Math.round((numeric + Number.EPSILON) * 100), error: false };
  }
  const cents = Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents < 0) return { cents: null, error: true };
  return { cents, error: false };
}

export function parseTaxRate(value: string): { rate: number | null; error: boolean } {
  const raw = value.trim();
  if (!raw) return { rate: null, error: true };
  if (!/^\d+(?:\.\d*)?$/.test(raw)) return { rate: null, error: true };
  const numeric = Number(raw);
  const rate = Math.round(numeric * 10_000);
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isSafeInteger(rate)) return { rate: null, error: true };
  return { rate, error: false };
}

export function formatMoney(cents: number, signed = false): string {
  const sign = cents < 0 ? "−" : signed && cents > 0 ? "+" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type CalculationInput = {
  mode: CalculationMode;
  provinceCode: string;
  amountCents: number;
  tipsCents: number;
  receiptTotalCents?: number | null;
  bcPstRate?: number;
};

export type TaxResult = {
  error: string | null;
  subtotalCents: number;
  gstCents: number;
  pstCents: number;
  qstCents: number;
  hstCents: number;
  totalTaxCents: number;
  roundingAdjustmentCents: number;
  amountAfterTaxCents: number;
  tipsCents: number;
  finalTotalCents: number;
  receiptTotalCents: number | null;
  differenceCents: number | null;
};

export function calculateTax(input: CalculationInput): TaxResult {
  const province = PROVINCES.find((item) => item.abbreviation === input.provinceCode);
  if (!province) throw new Error("Unknown province or territory.");
  const pstRate = province.abbreviation === "BC" && input.bcPstRate !== undefined
    ? input.bcPstRate
    : province.pstRate;
  const combinedRate = province.gstRate + pstRate + province.qstRate + province.hstRate;

  if (input.mode === "final-total" && input.tipsCents > input.amountCents) {
    return {
      error: "Tips cannot be greater than the final total.", subtotalCents: 0, gstCents: 0, pstCents: 0,
      qstCents: 0, hstCents: 0, totalTaxCents: 0, roundingAdjustmentCents: 0,
      amountAfterTaxCents: 0, tipsCents: input.tipsCents, finalTotalCents: 0,
      receiptTotalCents: null, differenceCents: null,
    };
  }

  const inclusiveCents = input.mode === "final-total" ? input.amountCents - input.tipsCents : input.amountCents;
  let subtotalCents: number;
  let gstCents: number;
  let pstCents: number;
  let qstCents: number;
  let hstCents: number;
  let amountAfterTaxCents: number;

  if (input.mode === "before-tax") {
    subtotalCents = input.amountCents;
    gstCents = taxFromSubtotal(subtotalCents, province.gstRate);
    pstCents = taxFromSubtotal(subtotalCents, pstRate);
    qstCents = taxFromSubtotal(subtotalCents, province.qstRate);
    hstCents = taxFromSubtotal(subtotalCents, province.hstRate);
    amountAfterTaxCents = subtotalCents + gstCents + pstCents + qstCents + hstCents;
  } else {
    const denominator = BigInt(SCALE + combinedRate);
    subtotalCents = roundDiv(BigInt(inclusiveCents) * BigInt(SCALE), denominator);
    gstCents = roundDiv(BigInt(inclusiveCents) * BigInt(province.gstRate), denominator);
    pstCents = roundDiv(BigInt(inclusiveCents) * BigInt(pstRate), denominator);
    qstCents = roundDiv(BigInt(inclusiveCents) * BigInt(province.qstRate), denominator);
    hstCents = roundDiv(BigInt(inclusiveCents) * BigInt(province.hstRate), denominator);
    amountAfterTaxCents = inclusiveCents;
  }

  const displayedTaxSum = gstCents + pstCents + qstCents + hstCents;
  const totalTaxCents = amountAfterTaxCents - subtotalCents;
  const roundingAdjustmentCents = totalTaxCents - displayedTaxSum;
  const finalTotalCents = amountAfterTaxCents + input.tipsCents;
  const receipt = input.mode === "final-total" ? null : (input.receiptTotalCents ?? null);

  return {
    error: null,
    subtotalCents,
    gstCents,
    pstCents,
    qstCents,
    hstCents,
    totalTaxCents,
    roundingAdjustmentCents,
    amountAfterTaxCents,
    tipsCents: input.tipsCents,
    finalTotalCents,
    receiptTotalCents: receipt,
    differenceCents: receipt === null ? null : receipt - finalTotalCents,
  };
}
