const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');

chromium.use(stealth);

/**
 * Handle Cloudflare challenge page.
 * Waits for auto-verification, or tries to click the checkbox inside the CF iframe.
 */
async function handleCloudflare(page) {
    const isCfPage = async () => {
        const t = await page.title();
        return t.includes('Tunggu') || t.includes('Just a moment') ||
               t.includes('Checking') || t.includes('Verifikasi');
    };

    if (!(await isCfPage())) return;
    console.error('   [CF] Cloudflare challenge detected, attempting bypass...');

    // Poll up to 20 seconds for auto-resolve first
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(2000);
        if (!(await isCfPage())) {
            console.error('   [CF] Auto-verified after', (i + 1) * 2, 'seconds!');
            return;
        }
    }

    // Still blocked — try clicking the Turnstile checkbox inside the iframe
    console.error('   [CF] Auto-verify failed, trying manual click...');
    try {
        const frames = page.frames();
        for (const frame of frames) {
            if (!frame.url().includes('cloudflare.com')) continue;
            console.error('   [CF] Found CF iframe:', frame.url().substring(0, 80));

            // Try multiple selectors for the Turnstile widget
            const selectors = [
                '.ctp-checkbox-label',
                '.mark',
                'input[type="checkbox"]',
                'label',
                'body',
            ];
            for (const sel of selectors) {
                try {
                    const el = await frame.$(sel);
                    if (el) {
                        // Use human-like mouse move + click
                        const box = await el.boundingBox();
                        if (box) {
                            await page.mouse.move(
                                box.x + box.width / 2 + Math.random() * 4 - 2,
                                box.y + box.height / 2 + Math.random() * 4 - 2
                            );
                            await page.waitForTimeout(300);
                            await el.click();
                            console.error('   [CF] Clicked:', sel);
                            break;
                        }
                    }
                } catch (_) {}
            }
            break;
        }
    } catch (e) {
        console.error('   [CF] Click error:', e.message);
    }

    // Wait up to 15 more seconds for redirect after click
    for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(2000);
        if (!(await isCfPage())) {
            console.error('   [CF] Passed after manual click!');
            return;
        }
    }

    console.error('   [CF] Warning: still on Cloudflare page, continuing anyway...');
}

async function scrapeBlibli(keyword, limit = 10) {
    console.error('=== Blibli Scraper ===\n');
    
    const userDataDir = path.join(__dirname, 'blibli-profile');
    
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        viewport: { width: 1280, height: 900 },
        locale: 'id-ID',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();
    let products = [];

    // Intercept API responses
    page.on('response', async (response) => {
        const url = response.url();
        try {
            if (url.includes('blibli') && response.status() === 200) {
                const contentType = response.headers()['content-type'] || '';
                if (contentType.includes('json')) {
                    const text = await response.text();
                    if (text.includes('"products"') || text.includes('"data"') || text.includes('"sku"') || text.includes('"items"')) {
                        console.error('   [API] Found data in:', url.substring(0, 60));
                        const json = JSON.parse(text);
                        const before = products.length;
                        extractBlibliProducts(json, products);
                        if (products.length > before) {
                            console.error('   [API] Extracted', products.length - before, 'products, sample rating:', products[before]?.rating, 'sold:', products[before]?.sold);
                        }
                    }
                }
            }
        } catch (e) {}
    });

    try {
        // Blibli search URL
        const searchUrl = `https://www.blibli.com/cari/${encodeURIComponent(keyword)}`;
        console.error('1. Searching:', keyword);
        console.error('   URL:', searchUrl);
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        console.error('2. Waiting for page to load...');
        await page.waitForTimeout(3000);

        // Handle Cloudflare challenge
        await handleCloudflare(page);

        // Check current URL
        const currentUrl = page.url();
        console.error('   Current URL:', currentUrl.substring(0, 80));

        // Scroll to load more
        console.error('3. Scrolling to load products...');
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 600));
            await page.waitForTimeout(1000);
            console.error(`   Scroll ${i+1}/4, products: ${products.length}`);
            if (products.length >= limit) break;
        }

        // Always run DOM scraping: enrich API products with sold, or fill in if API missed products
        console.error('4. Enriching from DOM...');
        
        const domProducts = await page.evaluate(() => {
            const items = [];
            const cards = document.querySelectorAll('a.elf-product-card');

            cards.forEach(card => {
                const href = card.href || '';
                if (!href.includes('blibli.com/p/')) return;

                const text = card.innerText || '';

                // Name: split by newline, skip leading "Ad" line if present
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                const adIdx = lines[0] === 'Ad' ? 1 : 0;
                const name = lines[adIdx] || '';

                // Price: first Rp occurrence with Indonesian thousand-dot format
                let price = 'N/A';
                const priceMatch = text.match(/Rp\s?([\d]{1,3}(?:\.[\d]{3})*)/);
                if (priceMatch) price = 'Rp' + priceMatch[1];

                // Rating: standalone digit (with optional comma/dot decimal) on its own line, before "Terjual"
                let rating = null;
                const ratingMatch = text.match(/\n(\d(?:[.,]\d)?)\n/);
                if (ratingMatch) {
                    rating = parseFloat(ratingMatch[1].replace(',', '.'));
                }

// Sold: "Terjual 160" or "Terjual 1,3 rb+" — capture full token including optional "rb"
                    let sold = null;
                    const soldMatch = text.match(/Terjual\s+([\d.,]+(?:\s*rb[+]?)?)/i);
                    if (soldMatch) sold = 'Terjual ' + soldMatch[1].trim();

                const imgEl = card.querySelector('img');

                if (name.length > 5 && href) {
                    items.push({
                        name: name.substring(0, 200),
                        price: price,
                        image: imgEl?.src || '',
                        rating: rating,
                        sold: sold,
                        link: href
                    });
                }
            });

            return items;
        });

        console.error('   Found', domProducts.length, 'products in DOM');

        domProducts.forEach(domP => {
            // Try to enrich existing API product with sold/rating from DOM
            const existing = products.find(p => p.link === domP.link);
            if (existing) {
                if (!existing.sold && domP.sold) existing.sold = domP.sold;
                if (!existing.rating && domP.rating) existing.rating = domP.rating;
            } else {
                // API missed it — add directly from DOM
                products.push({ ...domP, marketplace: 'blibli' });
            }
        });

        console.error('\n=== RESULT ===');
        console.error('Total products:', products.length);

        await context.close();

        // Dedupe and limit
        const unique = [];
        const seen = new Set();
        for (const p of products) {
            if (!seen.has(p.link) && unique.length < limit) {
                seen.add(p.link);
                unique.push({ ...p, marketplace: 'blibli' });
            }
        }

        return { success: unique.length > 0, data: unique, count: unique.length };

    } catch (error) {
        console.error('Error:', error.message);
        await context.close().catch(() => {});
        return { success: false, error: error.message, data: [] };
    }
}

function extractBlibliProducts(obj, products) {
    if (!obj || typeof obj !== 'object') return;
    
    // Check for Blibli product structure
    if ((obj.sku || obj.id) && obj.name && (obj.price || obj.salePrice || obj.finalPrice)) {
        const priceObj = obj.salePrice || obj.finalPrice || obj.price;
        let price = priceObj;
        
        // Handle price object
        if (typeof priceObj === 'object' && priceObj !== null) {
            price = priceObj.value || priceObj.minPrice || priceObj.amount || 0;
        }
        
        const priceStr = typeof price === 'number' ? 'Rp' + price.toLocaleString('id-ID') : String(price);
        
        const exists = products.some(p => p.link?.includes(obj.sku) || p.link?.includes(obj.url));
        
        // Extract rating - Blibli uses various field names
        const rating = obj.review?.rating
            || obj.review?.averageRating
            || obj.rating
            || obj.averageRating
            || obj.ratingAverage
            || obj.productRating
            || null;

        // Extract sold count - Blibli uses various field names
        const soldRaw = obj.soldCount
            || obj.itemSoldCount
            || obj.totalSold
            || obj.quantitySold
            || obj.review?.totalPurchased
            || obj.totalReview
            || obj.reviewCount
            || null;
        const sold = soldRaw ? soldRaw + ' terjual' : null;

        if (!exists) {
            products.push({
                name: obj.name,
                price: priceStr,
                image: obj.images?.[0] || obj.image || obj.itemImages?.[0] || obj.defaultImage || '',
                rating: rating ? parseFloat(rating) : null,
                sold: sold,
                link: obj.url || `https://www.blibli.com/p/${obj.sku}`,
                marketplace: 'blibli'
            });
        }
        return;
    }

    // Check for products/data arrays
    if (obj.products && Array.isArray(obj.products)) {
        obj.products.forEach(p => extractBlibliProducts(p, products));
        return;
    }
    if (obj.data?.products && Array.isArray(obj.data.products)) {
        obj.data.products.forEach(p => extractBlibliProducts(p, products));
        return;
    }

    // Recurse
    if (Array.isArray(obj)) {
        obj.forEach(item => extractBlibliProducts(item, products));
    } else {
        for (const val of Object.values(obj)) {
            if (typeof val === 'object') extractBlibliProducts(val, products);
        }
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    scrapeBlibli(args[0] || 'laptop', parseInt(args[1]) || 10)
        .then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { scrapeBlibli };
