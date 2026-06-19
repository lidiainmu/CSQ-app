import { createServerFn } from "@tanstack/react-start";
import { chromium } from "playwright";

export type FormSignals = {
  hasManualFirmographics: boolean;
  hasValidationIssue: boolean;
  hasSplitNames: boolean;
  hasSalutation: boolean;
  totalFieldCount: number;
  source: "live-dom" | "structural-benchmark" | "manual-checklist";
};

// This parses the actual HTML pulled from the live website
function parseHtml(html: string): Omit<FormSignals, "source"> {
  const h = html.toLowerCase();

  // Isolate the largest form block if present
  const formMatch = h.match(/<form[\s\S]*?<\/form>/g);
  const target = formMatch ? formMatch.sort((a, b) => b.length - a.length)[0] : h;

  const hasSplitNames = /(name=|id=|placeholder=)["'][^"']*(first[\s_-]?name|last[\s_-]?name|firstname|lastname|fname|lname|given[\s_-]?name|family[\s_-]?name)/.test(target);
  const hasSalutation = /(name=|id=)["'][^"']*(salutation|prefix|honorific)/.test(target)
    || /<option[^>]*>\s*(mr\.?|mrs\.?|ms\.?|dr\.?|miss)\s*<\/option>/.test(target);
  const hasManualFirmographics = /(name=|id=|placeholder=)["'][^"']*(company[\s_-]?size|employees|num[\s_-]?employees|industry|sector|annual[\s_-]?revenue|job[\s_-]?function|department)/.test(target);

  // Validation-issue heuristic
  const inputs = target.match(/<input\b[^>]*>/g) || [];
  const hasRequired = /\brequired\b/.test(target);
  const hasPattern = /\bpattern\s*=/.test(target);
  const hasAriaInvalid = /aria-invalid|aria-describedby/.test(target);
  const hasInlineValidation = hasRequired || hasPattern || hasAriaInvalid;
  const hasValidationIssue = inputs.length >= 3 && !hasInlineValidation;

  const totalFieldCount =
    (target.match(/<input\b(?![^>]*type=["'](hidden|submit|button|reset|image)["'])[^>]*>/g) || []).length +
    (target.match(/<select\b[^>]*>/g) || []).length +
    (target.match(/<textarea\b[^>]*>/g) || []).length;

  return {
    hasSplitNames,
    hasSalutation,
    hasManualFirmographics,
    hasValidationIssue,
    totalFieldCount: Math.max(totalFieldCount, 0),
  };
}

export const analyzeFormUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data?.url || typeof data.url !== "string") throw new Error("URL required");
    return data;
  })
  .handler(async ({ data }): Promise<FormSignals> => {
    let url = data.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled"],
      });
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
        timezoneId: "America/New_York",
      });

      // Hide the headless fingerprint that bot-detection scripts check
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      const page = await context.newPage();

      // domcontentloaded is enough — SSR pages have form HTML immediately.
      // networkidle never resolves on Wix/heavy-analytics sites.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

      // Give JS-rendered forms up to 8 s to appear, then proceed either way
      await page.waitForSelector("form, input, select, textarea", { timeout: 8000 }).catch(() => {});

      const html = await page.content();
      await browser.close();

      if (!/<form|<input|<select|<textarea/i.test(html)) {
        throw new Error("No form elements found on this page content.");
      }

      return { 
        ...parseHtml(html), 
        source: "live-dom" 
      };

    } catch (error) {
      if (browser) await browser.close();
      console.error("Scraping failed, dropping to benchmark defaults:", error);
      
      // Fallback baseline values if a site aggressively blocks automated headless execution
      return {
        hasManualFirmographics: true,
        hasValidationIssue: true,
        hasSplitNames: true,
        hasSalutation: false,
        totalFieldCount: 7,
        source: "structural-benchmark",
      };
    }
  });