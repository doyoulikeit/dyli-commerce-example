// Run against the isolated offers preview; no real API calls or wallet sends.
import assert from "node:assert/strict";
if (!process.env.PUPPETEER_PACKAGE_PATH) throw Error("Set PUPPETEER_PACKAGE_PATH to temporary verification dependencies");
const { default: puppeteer } = await import(process.env.PUPPETEER_PACKAGE_PATH);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const errors = [];
const open = async (query = "", width = 1280) => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: 900 });
  page.on("pageerror", error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", request => request.url().startsWith("http://127.0.0.1:3110/")
    ? request.continue() : request.abort());
  await page.goto(`http://127.0.0.1:3110/${query}`, { waitUntil: "networkidle0" });
  return { context, page };
};
const click = async (page, text) => {
  await page.waitForFunction(text => [...document.querySelectorAll("button")].some(button => button.textContent === text && !button.disabled), {}, text);
  await page.evaluate(text => [...document.querySelectorAll("button")].find(button => button.textContent === text).click(), text);
};
const audit = page => page.evaluate(() => window.fixtureAudit);
const assertQuietMissing = async page => {
  await page.waitForFunction(() => document.body.textContent.includes("This item is no longer in your vault."));
  const buttons = await page.$$eval("button", elements => elements.map(element => element.textContent));
  assert.equal(buttons.some(text => /^(Accept offer|Sell|Ship|List for sale|Trade)/.test(text)), false);
  assert.equal(await page.$("[role=alert]"), null);
  assert.equal((await audit(page)).some(event => event.type === "send"), false);
};
try {
  for (const width of [1280, 390]) {
    const { context, page } = await open("?notowned", width);
    await assertQuietMissing(page);
    await page.waitForFunction(() => window.fixtureAudit.some(event => event.type === "account-read"));
    assert.equal((await audit(page)).filter(event => event.type === "account-read").length, 1);
    assert.match(await page.$eval("body", element => element.textContent), /Balance: \$100/);
    await context.close();
  }
  {
    const { context, page } = await open("?vault&notowned");
    await page.waitForFunction(() => document.body.textContent.includes("No longer in this vault"));
    assert.equal(await page.$(".lc-vault-card-actions"), null);
    assert.equal((await audit(page)).filter(event => event.type === "account-read").length, 0);
    await context.close();
  }
  {
    const { context, page } = await open("?notowned&accountfail");
    await assertQuietMissing(page);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Refresh vault"));
    await page.evaluate(() => { window.fixtureRefreshAvailable = true; });
    await click(page, "Refresh vault");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Back to vault"));
    assert.equal((await audit(page)).filter(event => event.type === "account-read").length, 2);
    await context.close();
  }
  {
    const { context, page } = await open("?lostbeforeprepare");
    await click(page, "Accept offer · $1.50");
    await assertQuietMissing(page);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await context.close();
  }
  {
    const { context, page } = await open("?empty");
    assert.match(await page.$eval("body", element => element.textContent), /No offer available right now/);
    assert.ok(await page.$(".lc-vault-ship"));
    assert.equal((await audit(page)).some(event => event.type === "account-read"), false);
    await context.close();
  }
  {
    const { context, page } = await open("?unavailable");
    assert.match(await page.$eval("body", element => element.textContent), /Retry loading offers/);
    assert.doesNotMatch(await page.$eval("body", element => element.textContent), /no longer in your vault/);
    await page.evaluate(() => { window.fixtureOffersAvailable = true; });
    await click(page, "Retry loading offers");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Accept offer · $1.50"));
    assert.equal((await audit(page)).some(event => event.type === "send"), false);
    await context.close();
  }
  {
    const { context, page } = await open("?recording");
    await click(page, "Accept offer · $1.50");
    await page.waitForFunction(() => window.fixtureAudit.some(event => event.action === "confirm"));
    // Reload with both zero ownership and the already-submitted transaction.
    await page.goto("http://127.0.0.1:3110/?resume&notowned", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.textContent.includes("Sale complete"));
    assert.equal((await audit(page)).some(event => event.type === "send"), false);
    assert.equal((await audit(page)).some(event => event.action === "confirm"), true);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log("Passed: stale ownership, preparation race, account retry, RPC retry, owned/no-bid, and submitted-sale recovery at desktop and phone widths.");
} finally { await browser.close(); }
