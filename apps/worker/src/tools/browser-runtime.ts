import { chromium, type Browser, type Page } from "playwright";

export interface BrowserInspection {
  url: string;
  title: string;
  status: number | null;
  screenshotPath?: string;
  accessibilitySnapshot?: unknown;
}

/** One scripted browser step used to drive a multi-step workflow. */
export interface BrowserAction {
  type: "click" | "fill" | "press" | "select" | "waitFor" | "goto";
  /** CSS or text selector, depending on `by`. */
  selector?: string;
  by?: "css" | "text" | "role";
  /** Accessible role name when `by` is `role`. */
  role?: string;
  value?: string;
  url?: string;
  timeoutMs?: number;
}

export interface BrowserActionResult {
  type: BrowserAction["type"];
  selector?: string;
  ok: boolean;
  detail?: string;
}

export interface BrowserSessionResult extends BrowserInspection {
  actions: BrowserActionResult[];
  consoleErrors: string[];
}

function assertSafeUrl(url: string): URL {
  const target = new URL(url);
  if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) {
    throw new Error("Browser URL must use HTTPS or target localhost");
  }
  return target;
}

function locatorFor(page: Page, action: BrowserAction) {
  const selector = action.selector;
  if (!selector) throw new Error(`Browser action ${action.type} requires a selector`);
  if (action.by === "text") return page.getByText(selector, { exact: false }).first();
  if (action.by === "role") {
    if (!action.role) throw new Error("Browser action with by=role requires a role name");
    return page.getByRole(action.role as never, { name: selector }).first();
  }
  return page.locator(selector).first();
}

/**
 * Runs a bounded browser interaction script in one session.
 *
 * Console errors are collected per step so a passing workflow that logged a
 * runtime error is still visible as evidence. Every action reports its own
 * outcome instead of failing the whole session on the first miss.
 */
export async function runBrowserSession(
  url: string,
  actions: BrowserAction[] = [],
  options: { screenshotPath?: string; timeoutMs?: number } = {},
): Promise<BrowserSessionResult> {
  const target = assertSafeUrl(url);
  const timeout = Math.min(Math.max(options.timeoutMs ?? 15_000, 1_000), 60_000);
  const browser: Browser = await chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  const results: BrowserActionResult[] = [];

  try {
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 300)));

    const response = await page.goto(target.toString(), { waitUntil: "networkidle", timeout: 30_000 });

    for (const action of actions) {
      try {
        switch (action.type) {
          case "click":
            await locatorFor(page, action).click({ timeout });
            break;
          case "fill":
            if (action.value === undefined) throw new Error("fill requires a value");
            await locatorFor(page, action).fill(action.value, { timeout });
            break;
          case "select":
            if (action.value === undefined) throw new Error("select requires a value");
            await locatorFor(page, action).selectOption(action.value, { timeout });
            break;
          case "press":
            if (!action.value) throw new Error("press requires a key in value");
            if (action.selector) await locatorFor(page, action).press(action.value, { timeout });
            else await page.keyboard.press(action.value);
            break;
          case "waitFor":
            await locatorFor(page, action).waitFor({ state: "visible", timeout });
            break;
          case "goto":
            if (!action.url) throw new Error("goto requires a url");
            await page.goto(assertSafeUrl(action.url).toString(), { waitUntil: "networkidle", timeout: 30_000 });
            break;
          default:
            throw new Error(`Unsupported browser action: ${String(action.type)}`);
        }
        results.push({ type: action.type, selector: action.selector, ok: true });
      } catch (error) {
        results.push({
          type: action.type,
          selector: action.selector,
          ok: false,
          detail: error instanceof Error ? error.message.slice(0, 300) : String(error),
        });
      }
    }

    if (options.screenshotPath) await page.screenshot({ path: options.screenshotPath, fullPage: true });

    return {
      url: target.toString(),
      title: await page.title(),
      status: response?.status() ?? null,
      screenshotPath: options.screenshotPath,
      accessibilitySnapshot: await page.locator("body").ariaSnapshot(),
      actions: results,
      consoleErrors,
    };
  } finally {
    await browser.close();
  }
}

export async function inspectBrowserPage(url: string, screenshotPath?: string): Promise<BrowserInspection> {
  const { actions, consoleErrors, ...inspection } = await runBrowserSession(url, [], { screenshotPath });
  void actions;
  void consoleErrors;
  return inspection;
}
