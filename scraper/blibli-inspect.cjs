const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
chromium.use(stealth);

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
    await page.goto('https://www.blibli.com/cari/laptop', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Get the full HTML of first product card to find rating/sold selectors
    const products = await page.evaluate(() => {
        const cards = document.querySelectorAll('a.elf-product-card');
        return [...cards].slice(0, 3).map(card => {
            const text = card.innerText || '';

            // Name
            const nameEl = card.querySelector('.els-product__name, [class*="name"]');
            const name = nameEl ? nameEl.innerText.trim() : text.split('\n')[1] || '';

            // Price
            const priceMatch = text.match(/Rp[\d.,]+/);
            const price = priceMatch ? priceMatch[0] : '';

            // Rating: appears as a single digit "5" or "4.8" before "Terjual"
            const ratingMatch = text.match(/\n(\d(?:\.\d)?)\n/);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

            // Sold: "Terjual 160" or "Terjual 1rb"
            const soldMatch = text.match(/Terjual\s+([\d.,rb+]+)/i);
            const sold = soldMatch ? 'Terjual ' + soldMatch[1] : null;

            return { name: name.substring(0, 80), price, rating, sold, rawText: text.substring(0, 200) };
        });
    });

    console.log(JSON.stringify(products, null, 2));
    await context.close();
})().catch(e => console.error('Error:', e.message));
