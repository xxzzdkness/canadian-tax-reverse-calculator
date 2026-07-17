# Canadian Tax Reverse Calculator

A responsive calculator for Canadian receipt taxes. It supports forward and reverse calculations, receipt-total verification, tips excluded from tax, separate GST/PST/QST/HST lines, and selectable British Columbia PST treatment.

## Live sites

- GitHub Pages: `https://xxzzdkness.github.io/canadian-tax-reverse-calculator/`
- ChatGPT Sites: `https://canadian-tax-reverse-calculator.thomas0627.chatgpt.site/`

## Development

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Run the calculator tests with:

```bash
node --experimental-strip-types --test tests/tax-calculator.test.ts
```

The GitHub Pages workflow builds a static export whenever `main` changes.
