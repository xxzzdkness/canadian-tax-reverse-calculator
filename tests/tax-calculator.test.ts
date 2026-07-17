import test from "node:test";
import assert from "node:assert/strict";
import { calculateTax, parseMoney, parseTaxRate } from "../lib/tax-calculator.ts";

const calc = (provinceCode: string, amountCents: number, tipsCents = 0) => calculateTax({
  mode: "before-tax", provinceCode, amountCents, tipsCents,
});

test("Ontario before tax", () => {
  const result = calc("ON", 10_000, 1_500);
  assert.equal(result.hstCents, 1_300);
  assert.equal(result.gstCents + result.pstCents + result.qstCents, 0);
  assert.equal(result.finalTotalCents, 12_800);
});

test("Alberta only GST", () => {
  const result = calc("AB", 10_000);
  assert.equal(result.gstCents, 500);
  assert.equal(result.pstCents + result.qstCents + result.hstCents, 0);
});

test("BC separates GST and PST", () => {
  const result = calc("BC", 10_000);
  assert.equal(result.gstCents, 500);
  assert.equal(result.pstCents, 700);
});

test("BC standard PST before tax", () => {
  const result = calculateTax({ mode: "before-tax", provinceCode: "BC", amountCents: 10_000, tipsCents: 1_500, bcPstRate: 70_000 });
  assert.equal(result.gstCents, 500);
  assert.equal(result.pstCents, 700);
  assert.equal(result.totalTaxCents, 1_200);
  assert.equal(result.finalTotalCents, 12_700);
});

test("BC no PST before tax", () => {
  const result = calculateTax({ mode: "before-tax", provinceCode: "BC", amountCents: 10_000, tipsCents: 1_500, bcPstRate: 0 });
  assert.equal(result.gstCents, 500);
  assert.equal(result.pstCents, 0);
  assert.equal(result.totalTaxCents, 500);
  assert.equal(result.finalTotalCents, 12_000);
});

test("BC no PST reverse calculation", () => {
  const result = calculateTax({ mode: "after-tax", provinceCode: "BC", amountCents: 10_500, tipsCents: 1_500, bcPstRate: 0 });
  assert.equal(result.subtotalCents, 10_000);
  assert.equal(result.gstCents, 500);
  assert.equal(result.pstCents, 0);
  assert.equal(result.finalTotalCents, 12_000);
});

test("BC standard PST reverse calculation", () => {
  const result = calculateTax({ mode: "after-tax", provinceCode: "BC", amountCents: 11_200, tipsCents: 1_500, bcPstRate: 70_000 });
  assert.equal(result.subtotalCents, 10_000);
  assert.equal(result.gstCents, 500);
  assert.equal(result.pstCents, 700);
  assert.equal(result.finalTotalCents, 12_700);
});

test("BC custom 8% PST", () => {
  const result = calculateTax({ mode: "before-tax", provinceCode: "BC", amountCents: 10_000, tipsCents: 0, bcPstRate: 80_000 });
  assert.equal(result.gstCents, 500);
  assert.equal(result.pstCents, 800);
  assert.equal(result.totalTaxCents, 1_300);
  assert.equal(result.finalTotalCents, 11_300);
});

test("Quebec separates GST and QST", () => {
  const result = calc("QC", 10_000);
  assert.equal(result.gstCents, 500);
  assert.equal(result.qstCents, 998);
  assert.equal(result.pstCents, 0);
});

test("Ontario reverses a tax-inclusive amount", () => {
  const result = calculateTax({ mode: "after-tax", provinceCode: "ON", amountCents: 11_300, tipsCents: 0 });
  assert.equal(result.subtotalCents, 10_000);
  assert.equal(result.hstCents, 1_300);
});

test("Ontario reverses final total after subtracting tips", () => {
  const result = calculateTax({ mode: "final-total", provinceCode: "ON", amountCents: 12_800, tipsCents: 1_500 });
  assert.equal(result.amountAfterTaxCents, 11_300);
  assert.equal(result.subtotalCents, 10_000);
  assert.equal(result.finalTotalCents, 12_800);
});

test("receipt match and one-cent difference remain distinct", () => {
  const match = calculateTax({ mode: "before-tax", provinceCode: "ON", amountCents: 10_000, tipsCents: 1_500, receiptTotalCents: 12_800 });
  const off = calculateTax({ mode: "before-tax", provinceCode: "ON", amountCents: 10_000, tipsCents: 1_500, receiptTotalCents: 12_801 });
  assert.equal(match.differenceCents, 0);
  assert.equal(off.differenceCents, 1);
});

test("tips greater than final total is rejected", () => {
  const result = calculateTax({ mode: "final-total", provinceCode: "ON", amountCents: 1_000, tipsCents: 1_001 });
  assert.equal(result.error, "Tips cannot be greater than the final total.");
});

test("money parser accepts symbols and commas, rejects negative and text", () => {
  assert.deepEqual(parseMoney("$1,247.83"), { cents: 124_783, error: false });
  assert.equal(parseMoney("-1").error, true);
  assert.equal(parseMoney("abc").error, true);
  assert.deepEqual(parseMoney(""), { cents: null, error: false });
});

test("custom PST rate accepts zero and decimals, rejects blank and negative values", () => {
  assert.deepEqual(parseTaxRate("0"), { rate: 0, error: false });
  assert.deepEqual(parseTaxRate("7.25"), { rate: 72_500, error: false });
  assert.equal(parseTaxRate("").error, true);
  assert.equal(parseTaxRate("-1").error, true);
  assert.equal(parseTaxRate("abc").error, true);
});

test("non-integer reverse calculation reconciles to input", () => {
  const result = calculateTax({ mode: "after-tax", provinceCode: "QC", amountCents: 14_783, tipsCents: 0 });
  assert.equal(result.subtotalCents + result.totalTaxCents, 14_783);
  assert.ok(Math.abs(result.roundingAdjustmentCents) <= 1);
});
