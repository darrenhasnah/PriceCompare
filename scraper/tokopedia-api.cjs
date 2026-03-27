/**
 * Tokopedia scraper using Playwright with stealth + persistent browser profile.
 *
 * The persistent profile keeps cookies/session between runs so Tokopedia
 * doesn't block us on every request. Uses playwright-extra + stealth to
 * avoid headless detection.
 *
 * Strategy:
 *   1. Intercept GQL responses from gql.tokopedia.com for structured data.
 *   2. Fall back to DOM scraping if API interception yields nothing.
 *   3. Deduplicate and return up to `limit` products.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');

chromium.use(stealth);

const PROFILE_DIR = path.join(__dirname, 'tokopedia-profile');

async function scrapeTokopedia(keyword, limit = 10) {
    let context;
    try {
        context = await chromium.launchPersistentContext(PROFILE_DIR, {
            headless: false,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-http2',
                '--start-minimized',
                '--window-position=-32000,-32000',
            ],
            viewport: { width: 1366, height: 768 },
            locale: 'id-ID',
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
    } catch (err) {
        console.error('Failed to launch browser:', err.message);
        return { success: false, error: 'Browser launch failed: ' + err.message, data: [] };
    }

    const page = context.pages()[0] || (await context.newPage());

    // Collect products from GQL API interception
    let apiProducts = [];

    page.on('response', async (response) => {
        const url = response.url();
        if (
            (url.includes('gql.tokopedia.com') || url.includes('graphql')) &&
            response.status() === 200
        ) {
            try {
                const contentType = response.headers()['content-type'] || '';
                if (!contentType.includes('json')) return;
                const json = await response.json();
                const found = extractProductsFromGQL(json);
                if (found.length > 0) {
                    console.error(`[GQL] Found ${found.length} products from API`);
                    apiProducts.push(...found);
                }
            } catch (_) {
                // ignore parse errors
            }
        }
    });

    try {
        const searchUrl = `https://www.tokopedia.com/search?q=${encodeURIComponent(keyword)}`;
        console.error('Navigating to:', searchUrl);

        await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        // Wait for network to settle
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

        // Give React time to render + GQL responses to arrive
        await page.waitForTimeout(4000);

        // Close popups / overlays
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // Scroll to trigger lazy-loaded product cards
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, 600));
            await page.waitForTimeout(1200);
        }

        // Extra wait for trailing API calls
        await page.waitForTimeout(2000);

        // ── DOM scraping as fallback / enrichment ──
        console.error('[DOM] Scraping product cards from page...');
        const domProducts = await page.evaluate((lim) => {
            const items = [];

            const selectors = [
                '[data-testid="master-product-card"]',
                '[data-testid="divProductWrapper"]',
                'article',
            ];

            let cards = [];
            for (const sel of selectors) {
                const found = document.querySelectorAll(sel);
                if (found.length > 2) {
                    cards = Array.from(found);
                    break;
                }
            }

            // Fallback: product links
            if (cards.length === 0) {
                const seen = new Set();
                document.querySelectorAll('a[href*="tokopedia.com/"]').forEach((link) => {
                    const href = link.href || '';
                    if (
                        href.match(/tokopedia\.com\/[^\/]+\/[^\/\?]+/) &&
                        !href.includes('/search') &&
                        !href.includes('/promo') &&
                        !href.includes('/discovery')
                    ) {
                        const card = link.closest('div[class]') || link.parentElement;
                        if (card && !seen.has(card)) {
                            seen.add(card);
                            cards.push(card);
                        }
                    }
                });
            }

            for (const card of cards) {
                if (items.length >= lim) break;

                try {
                    const text = card.textContent || '';
                    const linkEl =
                        card.tagName === 'A'
                            ? card
                            : card.querySelector('a[href*="tokopedia.com/"]') || card.querySelector('a');
                    const href = linkEl?.href || '';

                    if (!href || href.includes('/login') || href.includes('/register')) continue;

                    // Name
                    let name = '';
                    const nameEl = card.querySelector(
                        '[data-testid="spnSRPProdName"], [data-testid="linkProductName"]'
                    );
                    if (nameEl) {
                        name = nameEl.textContent.trim();
                    } else {
                        const img = card.querySelector('img');
                        name = img?.alt || text.split('Rp')[0]?.trim().substring(0, 120) || '';
                    }

                    // Price
                    let price = '';
                    const priceEl = card.querySelector(
                        '[data-testid="spnSRPProdPrice"], [data-testid="linkProductPrice"]'
                    );
                    if (priceEl) {
                        price = priceEl.textContent.trim();
                    } else {
                        const m = text.match(/Rp[\s]?[\d.,]+/);
                        if (m) price = m[0].replace(/\s/g, '');
                    }

                    // Image
                    const imgEl = card.querySelector('img');
                    const image = imgEl?.src || imgEl?.getAttribute('data-src') || '';

                    // Rating
                    let rating = null;
                    const ratingEl = card.querySelector('[data-testid="spnSRPProdRating"]');
                    if (ratingEl) {
                        const rv = parseFloat(ratingEl.textContent);
                        if (!isNaN(rv)) rating = rv;
                    }

                    // Sold
                    let sold = null;
                    const soldEl = card.querySelector('[data-testid="spnSRPProdSold"]');
                    if (soldEl) {
                        sold = soldEl.textContent.trim();
                    } else {
                        const soldMatch = text.match(/Terjual\s+([\d.,]+\s*(?:rb\+?)?)/i);
                        if (soldMatch) sold = 'Terjual ' + soldMatch[1].trim();
                    }

                    if (name && price) {
                        items.push({
                            name,
                            price,
                            image,
                            rating,
                            sold,
                            link: href,
                            marketplace: 'tokopedia',
                        });
                    }
                } catch (_) {}
            }

            return items;
        }, limit);

        console.error(`[DOM] Found ${domProducts.length} products from DOM`);

        await context.close();
        context = null;

        // ── Merge API + DOM, prefer API data ──
        const merged = [...apiProducts];
        const seenLinks = new Set(apiProducts.map((p) => p.link));

        for (const dp of domProducts) {
            const existing = merged.find((p) => p.link === dp.link || p.name === dp.name);
            if (existing) {
                if (!existing.sold && dp.sold) existing.sold = dp.sold;
                if (!existing.rating && dp.rating) existing.rating = dp.rating;
                if (!existing.image && dp.image) existing.image = dp.image;
            } else if (!seenLinks.has(dp.link)) {
                seenLinks.add(dp.link);
                merged.push(dp);
            }
        }

        // Dedupe and limit
        const unique = [];
        const finalSeen = new Set();
        for (const p of merged) {
            const key = p.link || p.name;
            if (!finalSeen.has(key) && unique.length < limit) {
                finalSeen.add(key);
                unique.push(p);
            }
        }

        console.error('Total unique products:', unique.length);

        return {
            success: unique.length > 0,
            data: unique,
            count: unique.length,
        };
    } catch (error) {
        console.error('Error:', error.message);
        if (context) await context.close().catch(() => {});
        return {
            success: false,
            error: error.message,
            data: [],
        };
    }
}

// ── Extract products from Tokopedia GQL JSON ──
function extractProductsFromGQL(obj, products = []) {
    if (!obj || typeof obj !== 'object') return products;

    // Handle array responses (Tokopedia batches GQL queries)
    if (Array.isArray(obj)) {
        for (const item of obj) extractProductsFromGQL(item, products);
        return products;
    }

    // Handle searchProductV5 / ace_search_product_v4 structure directly
    const searchResult =
        obj?.data?.searchProductV5?.data?.products ||
        obj?.data?.ace_search_product_v4?.data?.products ||
        null;

    if (searchResult && Array.isArray(searchResult)) {
        for (const p of searchResult) {
            let priceStr = '';
            if (p.price && typeof p.price === 'object') {
                priceStr = p.price.text || p.price.fmt || (p.price.number ? 'Rp' + Number(p.price.number).toLocaleString('id-ID') : '');
            } else if (typeof p.price === 'string') {
                priceStr = p.price;
            }
            if (p.priceRange && !priceStr) priceStr = p.priceRange;

            let imageUrl = '';
            if (p.mediaURL && typeof p.mediaURL === 'object') {
                imageUrl = p.mediaURL.image300 || p.mediaURL.image || '';
            } else {
                imageUrl = p.imageUrl || p.image || p.thumbnail || '';
            }

            let sold = null;
            if (p.labelGroups && Array.isArray(p.labelGroups)) {
                const soldLabel = p.labelGroups.find(
                    (l) => l.title && (l.title.includes('Terjual') || l.title.includes('terjual'))
                );
                if (soldLabel) sold = soldLabel.title;
            }
            if (!sold && p.countSold) sold = p.countSold;

            let rating = null;
            if (typeof p.rating === 'number') {
                rating = p.rating;
            } else if (typeof p.rating === 'string' && p.rating) {
                rating = parseFloat(p.rating) || null;
            } else if (p.ratingAverage) {
                rating = parseFloat(p.ratingAverage) || null;
            }

            const link = p.url || p.applink || '';

            if (p.name && priceStr) {
                products.push({
                    name: String(p.name),
                    price: priceStr,
                    image: imageUrl,
                    rating,
                    sold,
                    link: link.startsWith('http') ? link : 'https://www.tokopedia.com' + link,
                    marketplace: 'tokopedia',
                });
            }
        }
        return products;
    }

    // Generic fallback: recurse into nested objects
    if (obj.name && (obj.price || obj.priceRange) && (obj.url || obj.applink)) {
        let priceStr = '';
        if (typeof obj.price === 'object' && obj.price !== null) {
            priceStr = obj.price.text || obj.price.fmt || String(obj.price.number || obj.price.value || '');
        } else if (typeof obj.price === 'string') {
            priceStr = obj.price;
        } else if (obj.priceRange) {
            priceStr = obj.priceRange;
        }

        if (priceStr && !priceStr.startsWith('Rp')) {
            priceStr = 'Rp' + priceStr;
        }

        let imageUrl = '';
        if (obj.mediaURL && typeof obj.mediaURL === 'object') {
            imageUrl = obj.mediaURL.image300 || obj.mediaURL.image || '';
        } else {
            imageUrl =
                obj.imageUrl || obj.image_url || obj.mediaUrl || obj.imageUri || obj.image || obj.thumbnail || '';
        }

        let sold = null;
        if (obj.countSold) {
            sold = obj.countSold;
        } else if (obj.labelGroups && Array.isArray(obj.labelGroups)) {
            const soldLabel = obj.labelGroups.find(
                (l) => l.title && (l.title.includes('Terjual') || l.title.includes('terjual'))
            );
            if (soldLabel) sold = soldLabel.title;
        }

        const link = obj.url || obj.applink || '';

        if (priceStr) {
            products.push({
                name: String(obj.name),
                price: priceStr,
                image: imageUrl,
                rating: obj.rating || obj.ratingAverage || null,
                sold,
                link: link.startsWith('http') ? link : 'https://www.tokopedia.com' + link,
                marketplace: 'tokopedia',
            });
        }
    }

    // Recurse into child properties
    for (const val of Object.values(obj)) {
        if (typeof val === 'object') extractProductsFromGQL(val, products);
    }

    return products;
}

// ── CLI ──
if (require.main === module) {
    const keyword = process.argv[2] || 'laptop';
    const limit = parseInt(process.argv[3]) || 10;

    scrapeTokopedia(keyword, limit)
        .then((result) => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        })
        .catch((err) => {
            console.error('Fatal:', err.message);
            console.log(JSON.stringify({ success: false, error: err.message, data: [] }));
            process.exit(1);
        });
}

module.exports = { scrapeTokopedia };
