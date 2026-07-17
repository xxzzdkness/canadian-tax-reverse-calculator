"use client";

import { useMemo, useState } from "react";
import {
  calculateTax,
  formatMoney,
  parseMoney,
  parseTaxRate,
  PROVINCES,
  type BcPstTreatment,
  type CalculationMode,
} from "@/lib/tax-calculator";

const MODES: { id: CalculationMode; label: string; description: string; field: string }[] = [
  {
    id: "before-tax",
    label: "Before Tax",
    description: "Enter the subtotal before any sales tax or tips.",
    field: "Subtotal Before Tax",
  },
  {
    id: "after-tax",
    label: "After Tax, Before Tips",
    description: "Enter the amount after sales tax but before tips.",
    field: "Tax-Inclusive Amount Before Tips",
  },
  {
    id: "final-total",
    label: "Final Total",
    description: "Enter the receipt total including sales tax and tips.",
    field: "Final Total Including Tips",
  },
];

const BC_PST_OPTIONS: { id: BcPstTreatment; label: string }[] = [
  { id: "standard", label: "Standard PST — 7%" },
  { id: "no-pst", label: "No PST — GST only" },
  { id: "custom", label: "Custom PST rate" },
];

type MoneyInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  helper?: string;
};

function MoneyInput({ id, label, value, onChange, optional, helper }: MoneyInputProps) {
  const [touched, setTouched] = useState(false);
  const parsed = parseMoney(value);
  const invalid = touched && value.trim() !== "" && parsed.error;

  return (
    <div className="field">
      <div className="label-row">
        <label htmlFor={id}>{label}</label>
        {optional && <span>Optional</span>}
      </div>
      <div className={`money-field ${invalid ? "field-error" : ""}`}>
        <span aria-hidden="true">$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          aria-invalid={Boolean(invalid)}
          onChange={(event) => {
            setTouched(true);
            onChange(event.target.value);
          }}
          onBlur={() => {
            setTouched(true);
            if (!parsed.error && parsed.cents !== null) onChange((parsed.cents / 100).toFixed(2));
          }}
        />
        <span className="currency">CAD</span>
      </div>
      {invalid ? <p className="input-message">Enter a valid non-negative amount.</p> : helper ? <p className="helper">{helper}</p> : null}
    </div>
  );
}

function AppIcon() {
  return (
    <div className="app-icon" aria-hidden="true">
      <span>$</span>
      <i />
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<CalculationMode>("before-tax");
  const [provinceCode, setProvinceCode] = useState("ON");
  const [mainAmount, setMainAmount] = useState("");
  const [tips, setTips] = useState("0.00");
  const [receiptTotal, setReceiptTotal] = useState("");
  const [bcPstTreatment, setBcPstTreatment] = useState<BcPstTreatment>("standard");
  const [customPstRate, setCustomPstRate] = useState("7");
  const [copied, setCopied] = useState(false);

  const activeMode = MODES.find((item) => item.id === mode)!;
  const province = PROVINCES.find((item) => item.abbreviation === provinceCode)!;
  const mainParsed = parseMoney(mainAmount);
  const tipsParsed = parseMoney(tips);
  const receiptParsed = parseMoney(receiptTotal);
  const customPstParsed = parseTaxRate(customPstRate);
  const isBritishColumbia = provinceCode === "BC";
  const effectiveBcPstRate = bcPstTreatment === "standard"
    ? 70_000
    : bcPstTreatment === "no-pst"
      ? 0
      : customPstParsed.rate;
  const customPstInvalid = isBritishColumbia && bcPstTreatment === "custom" && customPstParsed.error;
  const pstApplicable = isBritishColumbia ? bcPstTreatment !== "no-pst" : province.pstRate > 0;
  const bcPstTreatmentLabel = bcPstTreatment === "custom"
    ? `Custom PST — ${customPstRate.trim()}%`
    : BC_PST_OPTIONS.find((option) => option.id === bcPstTreatment)!.label;

  const result = useMemo(() => {
    if (mainParsed.cents === null || tipsParsed.cents === null || mainParsed.error || tipsParsed.error || customPstInvalid) return null;
    return calculateTax({
      mode,
      provinceCode,
      amountCents: mainParsed.cents,
      tipsCents: tipsParsed.cents,
      bcPstRate: isBritishColumbia ? effectiveBcPstRate ?? undefined : undefined,
      receiptTotalCents: mode !== "final-total" && receiptParsed.cents !== null && !receiptParsed.error ? receiptParsed.cents : null,
    });
  }, [mode, provinceCode, mainParsed.cents, mainParsed.error, tipsParsed.cents, tipsParsed.error, receiptParsed.cents, receiptParsed.error, customPstInvalid, effectiveBcPstRate, isBritishColumbia]);

  const reset = () => {
    setProvinceCode("ON");
    setMainAmount("");
    setTips("0.00");
    setReceiptTotal("");
    setBcPstTreatment("standard");
    setCustomPstRate("7");
    setCopied(false);
  };

  const changeMode = (nextMode: CalculationMode) => {
    setMode(nextMode);
    setMainAmount("");
    setReceiptTotal("");
    setCopied(false);
  };

  const copyResult = async () => {
    if (!result || result.error) return;
    const lines = [
      `Province: ${province.name}`,
      `Mode: ${activeMode.label}`,
      ...(isBritishColumbia ? [`BC PST Treatment: ${bcPstTreatmentLabel}`] : []),
      `Subtotal: ${formatMoney(result.subtotalCents)}`,
      ...(["gst", "pst", "qst", "hst"] as const)
        .filter((tax) => tax === "pst" ? pstApplicable : province[`${tax}Rate`] > 0)
        .map((tax) => `${tax.toUpperCase()}: ${formatMoney(result[`${tax}Cents`])}`),
      `Total Tax: ${formatMoney(result.totalTaxCents)}`,
      `Amount After Tax: ${formatMoney(result.amountAfterTaxCents)}`,
      `Tips: ${formatMoney(result.tipsCents)}`,
      `${mode === "final-total" ? "Final Total" : "Calculated Final Total"}: ${formatMoney(result.finalTotalCents)}`,
    ];
    if (result.roundingAdjustmentCents) lines.push(`Rounding Adjustment: ${formatMoney(result.roundingAdjustmentCents, true)}`);
    if (result.receiptTotalCents !== null) {
      lines.push(`Receipt Total: ${formatMoney(result.receiptTotalCents)}`);
      lines.push(`Difference: ${formatMoney(result.differenceCents ?? 0, true)}`);
      lines.push(`Status: ${result.differenceCents === 0 ? "Match" : "Difference"}`);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const hasResult = Boolean(result && !result.error);
  const displayPstRate = isBritishColumbia ? effectiveBcPstRate ?? 0 : province.pstRate;
  const rateLabel = province.hstRate
    ? `HST ${province.hstRate / 10_000}%`
    : [province.gstRate && `GST ${province.gstRate / 10_000}%`, pstApplicable && `PST ${displayPstRate / 10_000}%`, province.qstRate && `QST ${province.qstRate / 10_000}%`]
        .filter(Boolean)
        .join(" + ");

  const detailRows = result && !result.error ? [
    ["Subtotal", formatMoney(result.subtotalCents)],
    ["GST", province.gstRate ? formatMoney(result.gstCents) : "—"],
    ["PST", pstApplicable ? formatMoney(result.pstCents) : "—"],
    ["QST", province.qstRate ? formatMoney(result.qstCents) : "—"],
    ["HST", province.hstRate ? formatMoney(result.hstCents) : "—"],
    ["Total Tax", formatMoney(result.totalTaxCents)],
    ...(result.roundingAdjustmentCents ? [["Rounding Adjustment", formatMoney(result.roundingAdjustmentCents, true)]] : []),
    ["Amount After Tax", formatMoney(result.amountAfterTaxCents)],
    ["Tips", formatMoney(result.tipsCents)],
    ["Final Total", formatMoney(result.finalTotalCents)],
  ] : [];

  return (
    <main>
      <header className="site-header">
        <div className="brand-wrap">
          <AppIcon />
          <div>
            <h1>Canadian Tax Reverse Calculator</h1>
            <p>Calculate, reverse-calculate and verify Canadian receipt taxes.</p>
          </div>
        </div>
        <span className="cad-pill">CAD only</span>
      </header>

      <div className="page-shell">
        <nav className="mode-tabs" aria-label="Calculation mode">
          {MODES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={mode === item.id ? "active" : ""}
              aria-pressed={mode === item.id}
              onClick={() => changeMode(item.id)}
            >
              <span>{index + 1}</span>{item.label}
            </button>
          ))}
        </nav>

        <section className="workspace-grid">
          <div className="panel input-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Receipt details</p>
                <h2>{activeMode.label}</h2>
              </div>
              <button type="button" className="reset" onClick={reset}>Reset</button>
            </div>
            <p className="mode-explanation">{activeMode.description}</p>

            <div className="field">
              <label htmlFor="province">Province or Territory</label>
              <div className="select-wrap">
                <select id="province" value={provinceCode} onChange={(event) => setProvinceCode(event.target.value)}>
                  {PROVINCES.map((item) => <option value={item.abbreviation} key={item.abbreviation}>{item.name}</option>)}
                </select>
              </div>
              <p className="rate-note"><span /> Current standard rate: <strong>{rateLabel}</strong></p>
            </div>

            {isBritishColumbia && (
              <div className="field bc-pst-field">
                <label htmlFor="bc-pst-treatment">BC PST Treatment</label>
                <div className="select-wrap">
                  <select id="bc-pst-treatment" value={bcPstTreatment} onChange={(event) => setBcPstTreatment(event.target.value as BcPstTreatment)}>
                    {BC_PST_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                  </select>
                </div>
                <p className="helper">BC PST does not apply to every purchase. Select the treatment shown on the receipt or applicable to the transaction.</p>

                {bcPstTreatment === "custom" && (
                  <div className="custom-rate-wrap">
                    <label htmlFor="custom-pst-rate">Custom PST Rate (%)</label>
                    <div className={`rate-field ${customPstInvalid ? "field-error" : ""}`}>
                      <input
                        id="custom-pst-rate"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={customPstRate}
                        aria-invalid={customPstInvalid}
                        onChange={(event) => setCustomPstRate(event.target.value)}
                      />
                      <span>%</span>
                    </div>
                    {customPstInvalid && <p className="input-message">Enter a valid non-negative PST rate.</p>}
                  </div>
                )}
              </div>
            )}

            <MoneyInput id="main-amount" label={activeMode.field} value={mainAmount} onChange={setMainAmount} helper={activeMode.description} />
            <MoneyInput id="tips" label="Tips" value={tips} onChange={setTips} helper="Tips are never included in the tax calculation." />
            {mode !== "final-total" && <MoneyInput id="receipt-total" label="Receipt Total" value={receiptTotal} onChange={setReceiptTotal} optional helper="Add the printed total to check the receipt." />}

            {result?.error && <div className="error-banner" role="alert"><strong>Unable to calculate</strong><span>{result.error}</span></div>}
          </div>

          <div className="results-column" aria-live="polite">
            <section className={`panel summary-panel ${!hasResult ? "empty" : ""}`}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Calculated result</p>
                  <h2>Receipt summary</h2>
                </div>
                <span className="province-chip">{province.abbreviation}</span>
              </div>

              {!hasResult ? (
                <div className="empty-state">
                  <div className="empty-receipt" aria-hidden="true">$</div>
                  <h3>Ready when you are</h3>
                  <p>Enter an amount to see the tax breakdown and receipt total.</p>
                </div>
              ) : result && !result.error ? (
                <>
                  <div className="summary-grid">
                    <div><span>Subtotal</span><strong>{formatMoney(result.subtotalCents)}</strong></div>
                    <div><span>Total Tax</span><strong>{formatMoney(result.totalTaxCents)}</strong></div>
                    <div><span>Tips</span><strong>{formatMoney(result.tipsCents)}</strong></div>
                    <div className="final-card"><span>Final Total</span><strong>{formatMoney(result.finalTotalCents)}</strong></div>
                  </div>

                  {result.receiptTotalCents !== null && (
                    <div className={`verification ${result.differenceCents === 0 ? "match" : "difference"}`}>
                      <div>
                        <span className="status-icon">{result.differenceCents === 0 ? "✓" : "!"}</span>
                        <div><strong>{result.differenceCents === 0 ? "Match" : `Difference: ${formatMoney(result.differenceCents ?? 0, true)}`}</strong><small>Receipt total {formatMoney(result.receiptTotalCents)}</small></div>
                      </div>
                      {result.differenceCents !== 0 && Math.abs(result.differenceCents ?? 0) <= 2 && <em>Possible rounding difference</em>}
                    </div>
                  )}

                  {result.roundingAdjustmentCents !== 0 && (
                    <div className="rounding-note"><strong>Rounding adjustment {formatMoney(result.roundingAdjustmentCents, true)}</strong><span>Shown because individually rounded tax lines differ from the tax-inclusive total.</span></div>
                  )}

                  <div className="breakdown-title"><h3>Tax breakdown</h3><span>{rateLabel}</span></div>
                  <div className="tax-table" role="table" aria-label="Tax breakdown">
                    {detailRows.map(([label, value]) => (
                      <div className={label === "Final Total" ? "total-row" : ""} role="row" key={label}>
                        <span role="cell">{label}</span><strong role="cell">{value}</strong>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="copy-button" onClick={copyResult}>{copied ? "✓ Copied" : "Copy Result"}</button>
                </>
              ) : null}
            </section>
          </div>
        </section>

        <footer>
          <p><strong>Tax rates last reviewed: July 16, 2026</strong></p>
          <p>This calculator assumes a standard fully taxable purchase. Tax treatment may differ for exempt, zero-rated or specially regulated goods and services.</p>
          <p className="sources">Rates checked against <a href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html" target="_blank" rel="noreferrer">Canada Revenue Agency</a> and <a href="https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/" target="_blank" rel="noreferrer">Revenu Québec</a>.</p>
        </footer>
      </div>
    </main>
  );
}
