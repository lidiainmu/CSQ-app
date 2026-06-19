# Online Form UX Grader

A tool that audits web forms for UX friction and quantifies the revenue impact of fixing it. Built as a demonstration of Contentsquare's value proposition around form analytics.

## What it does

Enter any form URL (signup, demo request, contact, checkout) and the tool will:

1. Scrape the live page with a headless browser
2. Detect five friction signals from the form's DOM
3. Score the form 0–100 based on UX best practices
4. Project the 12-month revenue opportunity from fixing each issue

If the page blocks automated scraping (common on Wix, some Marketo setups), a short manual checklist collects the same signals from the user directly.

### Friction signals detected

| Signal | Penalty | Estimated conversion lift |
|---|---|---|
| Manual company fields (industry, size, job function) | −25 pts | +25% |
| Missing inline validation | −20 pts | +22% |
| Salutation dropdown (Mr / Mrs / Ms / Dr) | −15 pts | +6% |
| Split first / last name fields | −10 pts | +5% |
| More than 5 visible fields | up to −20 pts | +10% |

## How it works

### 1. Scraping with headless Chromium (`src/lib/analyze-form.functions.ts`)

The URL is passed to a TanStack Start server function, which launches a headless Chromium instance via Playwright. The browser navigates to the page and waits for `domcontentloaded` (rather than `networkidle`, which never resolves on analytics-heavy sites like Wix or Marketo). A `waitForSelector` call gives JavaScript-rendered forms up to 8 seconds to appear before the DOM is captured.

Several browser fingerprinting mitigations are applied to avoid bot detection: `--disable-blink-features=AutomationControlled`, a realistic Chrome user-agent, and an init script that removes `navigator.webdriver`.

If scraping fails for any reason (bot protection, timeout, no form found), the user is shown a five-question checklist that collects the same signals manually.

### 2. Signal detection (`parseHtml`)

The raw HTML is lowercased and the largest `<form>` block is isolated using a regex match sorted by length — so navigation forms or search bars don't interfere.

Five signals are then detected with targeted regex patterns:

- **Split names**: checks `name`, `id`, and `placeholder` attributes for `firstname`, `lastname`, `fname`, `lname`, and variants
- **Salutation**: checks for `name`/`id` containing `salutation`, `prefix`, or `honorific`, or a `<select>` whose `<option>` text is exactly `Mr`, `Mrs`, `Ms`, `Dr`, or `Miss`
- **Manual firmographics**: checks attributes for `company_size`, `industry`, `sector`, `job_function`, `department`, and similar
- **Missing inline validation**: flags forms with 3+ `<input>` elements that have no `required`, `pattern`, or `aria-invalid` attributes
- **Field count**: counts non-hidden `<input>`, `<select>`, and `<textarea>` elements

### 3. Scoring

The score starts at 100 and each detected signal deducts points:

```
hasManualFirmographics  → −25 pts
hasValidationIssue      → −20 pts
hasSalutation           → −15 pts
hasSplitNames           → −10 pts
totalFieldCount > 5     → −5 pts per extra field, capped at −20 pts
```

### 4. Revenue calculation

Each signal also carries an estimated conversion rate lift based on industry research. Lifts are applied **sequentially and compounded**, not added — the same way real conversion improvements stack:

```
runningRate = currentConvRate
if hasManualFirmographics: runningRate × 1.25
if hasValidationIssue:     runningRate × 1.22
if hasSplitNames:          runningRate × 1.05
if hasSalutation:          runningRate × 1.06
if totalFieldCount > 5:    runningRate × 1.10
```

Revenue at each step is calculated as `monthlyTraffic × convRate × leadValue × 12`. The revenue opportunity shown is the delta between the optimised annual revenue and the current baseline. Each recommendation card shows the marginal revenue contribution of fixing just that one issue, ordered from highest to lowest impact.

## Tech stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19, SSR)
- **Styling**: Tailwind CSS v4, shadcn/ui
- **Scraping**: Playwright (headless Chromium, server-side)
- **Language**: TypeScript
- **Package manager**: Bun

## Running locally

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Deployed on Railway using Docker. The `Dockerfile` installs Playwright's Chromium binary and builds the Nitro server bundle.

Build command handled by Docker — no manual configuration needed beyond connecting the GitHub repo in Railway.
