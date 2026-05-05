import { chromium, type Browser, type BrowserContext } from "playwright-core";
import path from "path";
import os from "os";
import fs from "fs";

let browserInstance: Browser | null = null;

function findLocalChromium(): string | undefined {
  // playwright-core doesn't bundle browsers — find the one installed by `npx playwright install`
  const cacheDir = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Caches", "ms-playwright")
    : path.join(os.homedir(), ".cache", "ms-playwright");

  if (!fs.existsSync(cacheDir)) return undefined;

  // Find the latest chromium_headless_shell-* directory
  const dirs = fs.readdirSync(cacheDir)
    .filter(d => d.startsWith("chromium_headless_shell"))
    .sort()
    .reverse();

  for (const dir of dirs) {
    const candidates = [
      path.join(cacheDir, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
      path.join(cacheDir, dir, "chrome-headless-shell-mac-x64", "chrome-headless-shell"),
      path.join(cacheDir, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  // Fall back to regular chromium
  const chromeDirs = fs.readdirSync(cacheDir)
    .filter(d => d.startsWith("chromium-"))
    .sort()
    .reverse();

  for (const dir of chromeDirs) {
    const candidates = [
      path.join(cacheDir, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      path.join(cacheDir, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      path.join(cacheDir, dir, "chrome-linux", "chrome"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  return undefined;
}

async function getLaunchOptions() {
  if (process.env.NODE_ENV === "production") {
    const sparticuz = await import("@sparticuz/chromium");
    return {
      executablePath: await sparticuz.default.executablePath(),
      args: sparticuz.default.args,
    };
  }
  return {
    executablePath: findLocalChromium(),
    args: [] as string[],
  };
}

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    const { executablePath, args } = await getLaunchOptions();
    browserInstance = await chromium.launch({ executablePath, args, headless: true });
  }
  return browserInstance;
}

export async function newContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  return browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-IN",
    extraHTTPHeaders: { "Accept-Language": "en-IN,en;q=0.9" },
  });
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
