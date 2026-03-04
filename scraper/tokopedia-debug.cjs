const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

(async () => {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'id-ID',
        viewport: { width: 1366, height: 768 }
    });
    const page = await ctx.newPage();

    const requests = [];
    page.on('response', async (res) => {
        const url = res.url();
        if (!url.endsWith('.png') && !url.endsWith('.jpg') && !url.endsWith('.woff2') && !url.endsWith('.css')) {
            requests.push(url.substring(0, 120) + ' [' + res.status() + ']');
        }
    });

    await page.goto('https://www.tokopedia.com/search?q=laptop', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(1000); }
    await page.waitForTimeout(5000);

    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 600));
    const cards = await page.evaluate(() => {
        const selectors = [
            '[data-testid="master-product-card"]',
            '[data-testid="spnProductName"]',
            '[class*="pcv3__info-content"]',
            'article',
        ];
        return selectors.map(s => s + ':' + document.querySelectorAll(s).length).join(', ');
    });

    console.log('Title:', title);
    console.log('\nCards found:', cards);
    console.log('\nGQL/API requests:');
    requests.filter(r => r.includes('gql') || r.includes('/api/')).forEach(r => console.log(' ', r));
    console.log('\nBody:\n', bodyText);

    await page.screenshot({ path: 'tokopedia-debug.png' });
    await browser.close();
})().catch(e => console.error('ERROR:', e.message));


