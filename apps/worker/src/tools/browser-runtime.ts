import { chromium, type Page } from "playwright";

export interface BrowserInspection {
  url: string;
  title: string;
  status: number | null;
  screenshotPath?: string;
  accessibilitySnapshot?: unknown;
}

export async function inspectBrowserPage(url: string, screenshotPath?: string): Promise<BrowserInspection> {
  const target = new URL(url);
  if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Browser URL must use HTTPS or target localhost");
  const browser = await chromium.launch({ headless: true });
  try {
    const page: Page = await browser.newPage();
    const response = await page.goto(target.toString(), { waitUntil: "networkidle", timeout: 30_000 });
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
    return { url: target.toString(), title: await page.title(), status: response?.status() ?? null, screenshotPath, accessibilitySnapshot: await page.locator("body").ariaSnapshot() };
  } finally { await browser.close(); }
}
