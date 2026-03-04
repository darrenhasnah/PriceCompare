const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const userDataDir = path.join(__dirname, 'blibli-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        viewport: { width: 1280, height: 900 },
        locale: 'id-ID',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();
    const apiUrls = [];
    const sampleData = [];

    page.on('response', async (r) => {
        try {
            const ct = r.headers()['content-type'] || '';
            if (ct.includes('json') && r.status() === 200) {
                const url = r.url();
                apiUrls.push(url.substring(0, 120));
                const text = await r.text();
                if ((text.includes('"name"') || text.includes('"sku"') || text.includes('"products"')) && sampleData.length < 2) {
                    sampleData.push({ url: url.substring(0, 80), sample: text.substring(0, 500) });
                }
            }
        } catch(e) {}
    });

    await page.goto('https://www.blibli.com/cari/laptop', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: path.join(__dirname, 'blibli-debug.png') });
    const title = await page.title();
    const bodySnippet = await page.evaluate(() => document.body.innerText.substring(0, 300));
    console.log('Page title:', title);
    console.log('Body text:', bodySnippet);

    console.log('\n=== JSON API URLs ===');
    apiUrls.forEach(u => console.log(' -', u));

    console.log('\n=== Sample API Data ===');
    sampleData.forEach(d => {
        console.log('URL:', d.url);
        console.log('Data:', d.sample);
        console.log('---');
    });

    const checks = await page.evaluate(() => {
        const results = {};
        const selectors = [
            'a[href*="/p/"]',
            '[class*="product"]',
            '[class*="rating"]',
            '[class*="star"]',
            '[class*="sold"]',
            '[class*="review"]',
            '[class*="terjual"]',
        ];
        selectors.forEach(sel => {
            results[sel] = document.querySelectorAll(sel).length;
        });

        // Try to get a product card sample
        const productLink = document.querySelector('a[href*="/p/"]');
        if (productLink) {
            results['sampleProductText'] = productLink.textContent.substring(0, 200);
            results['sampleProductHTML'] = productLink.innerHTML.substring(0, 500);
        }
        return results;
    });

    console.log('\n=== DOM Checks ===');
    console.log(JSON.stringify(checks, null, 2));

    await context.close();
})().catch(e => console.error('Error:', e.message));
