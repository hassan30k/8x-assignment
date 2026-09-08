import puppeteer from "puppeteer-core";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
const errors = [];
const consoleErrors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("requestfailed", (r) => errors.push("request-failed: " + (r.url() || "").slice(0, 80) + " " + String(r.failure()?.errorText)));

await page.goto(BASE, { waitUntil: "load", timeout: 90000 });
await new Promise((r) => setTimeout(r, 12000));
const input = await page.waitForSelector("input[placeholder='Say hi, or send a product URL…']", { timeout: 20000 });
console.log("app hydrated: true");

await input.click();
await page.keyboard.type("what is 12 times 12? give me the number only", { delay: 12 });
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 15000));

const body = await page.evaluate(() => document.body.innerText);
console.log("--- body text (last 200 chars) ---");
console.log(body.trim().slice(-200));
console.log("\n--- pageerror (" + errors.length + ") ---");
for (const e of errors) console.log(String(e).slice(0, 300));
console.log("\n--- console.error (" + consoleErrors.length + ") ---");
for (const e of consoleErrors) console.log(e.slice(0, 300));
await browser.close();
process.exit(0);