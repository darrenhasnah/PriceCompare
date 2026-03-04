/**
 * Blibli Scraper — Playwright + stealth, persistent profile.
 *
 * 1. Try direct HTTP API first (fast, no browser needed).
 * 2. If Cloudflare blocks (403), fall back to Playwright browser scraping.
 * 3. DOM scraping enriches / fills in rating & sold count.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const https = require('https');
const fs = require('fs');
const path = require('path');

chromium.use(stealth);

const PROFILE_DIR = path.join(__dirname, 'blibli-profile');
const COOKIE_CACHE = path.join(__dirname, 'blibli-cookies.json');

// ─── Cookie helpers ─────────────────────────────────────────────────────────
function loadCookies() {
    if (fs.existsSync(COOKIE_CACHE)) {
        try {
            const data = JSON.parse(fs.readFileSync(COOKIE_CACHE, 'utf8'));
            if (Date.now() - (data.savedAt || 0) < 12 * 60 * 60 * 1000) return data.cookies;
        } catch (_) {}
    }
    return null;
}

function saveCookies(cookies) {
    fs.writeFileSync(COOKIE_CACHE, JSON.stringify({ savedAt: Date.now(), cookies }));
}

// ─── Direct HTTP GET (for API-first approach) ───────────────────────────────
function httpGet(url, cookies = []) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.blibli.com/',
            'Origin': 'https://www.blibli.com',
        };
        if (cookies.length > 0) headers['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        const req = https.get(url, { headers }, (res) => {
            const chunks = [];
            let stream = res;
            const enc = res.headers['content-encoding'];
            const zlib = require('zlib');
            if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
            else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
            else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
            stream.on('data', c => chunks.push(c));
            stream.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
            stream.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
    });
}

// ─── Parse Blibli backend API JSON ──────────────────────────────────────────
function parseApiProducts(json) {
    const products = [];
    const items = json?.data?.products || json?.data?.items || json?.products || json?.items || [];

    for (const item of items) {
        const p = item?.product ?? item;

        // Price
        const priceObj = p.salePrice ?? p.finalPrice ?? p.price ?? {};
        let price = '';
        if (typeof priceObj === 'number') price = 'Rp' + priceObj.toLocaleString('id-ID');
        else if (typeof priceObj === 'object' && priceObj !== null) {
            const val = priceObj.minPrice ?? priceObj.value ?? priceObj.amount ?? 0;
            price = 'Rp' + Number(val).toLocaleString('id-ID');
        } else if (typeof priceObj === 'string') price = priceObj;

        // Rating
        const rating = p.rating ?? p.averageRating ?? p.reviewSummary?.rating
            ?? p.review?.rating ?? p.review?.averageRating ?? null;

        // Sold
        const soldRaw = p.soldCount ?? p.itemSoldCount ?? p.totalSold
            ?? p.reviewSummary?.transactionCount ?? null;
        const sold = soldRaw != null ? 'Terjual ' + soldRaw : null;

        // Image
        const image = p.images?.[0] ?? p.image ?? p.defaultImage ?? p.imageUrl ?? '';

        // URL
        const url = p.url ?? (p.sku ? `https://www.blibli.com/p/${p.sku}` : '');

        if (p.name && price) {
            products.push({
                name: p.name,
                price,
                image,
                rating: rating != null ? parseFloat(rating) : null,
                sold,
                link: url,
                marketplace: 'blibli',
            });
        }
    }
    return products;
}

// ─── Cloudflare handler ─────────────────────────────────────────────────────
async function handleCloudflare(page) {
    const isCF = async () => {
        const t = await page.title();
        return t.includes('Tunggu') || t.includes('Just a moment') || t.includes('Checking') || t.includes('Verifikasi');
    };
    if (!(await isCF())) return;
    console.error('   [CF] Challenge detected, waiting...');

    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(2000);
        if (!(await isCF())) { console.error('   [CF] Passed!'); return; }
    }
    console.error('   [CF] Still blocked after 30s, continuing anyway...');
}

// ─── Browser-based fallback (DOM scraping) ──────────────────────────────────
async function scrapeBrowserFallback(keyword, limit) {
    console.error('[Browser] Launching Playwright fallback...');
    let context;
    try {
        context = await chromium.launchPersistentContext(PROFILE_DIR, {
            headless: false,
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-http2'],
            viewport: { width: 1280, height: 900 },
            locale: 'id-ID',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
    } catch (err) {
        return { success: false, error: 'Browser launch failed: ' + err.message, data: [] };
    }

    const page = context.pages()[0] || await context.newPage();
    let apiProducts = [];

    // Intercept API responses
    page.on('response', async (response) => {
        try {
            const url = response.url();
            if (url.includes('blibli') && response.status() === 200) {
                const ct = response.headers()['content-type'] || '';
                if (ct.includes('json')) {
                    const text = await response.text();
                    if (text.includes('"products"') || text.includes('"sku"')) {
                        const json = JSON.parse(text);
                        const found = parseApiProducts(json);
                        if (found.length > 0) {
                            console.error(`   [API] Intercepted ${found.length} products`);
                            apiProducts.push(...found);
                        }
                    }
                }
            }
        } catch (_) {}
    });

    try {
        const searchUrl = `https://www.blibli.com/cari/${encodeURIComponent(keyword)}`;
        console.error('[Browser] Navigating:', searchUrl);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3000);
        await handleCloudflare(page);

        // Scroll to load products
        for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 600));
            await page.waitForTimeout(1200);
        }
        await page.waitForTimeout(2000);

        // ── DOM scraping: rating & sold ──
        console.error('[Browser] DOM scraping...');
        const domProducts = await page.evaluate(() => {
            const items = [];
            const cards = document.querySelectorAll('a.elf-product-card');

            cards.forEach(card => {
                const href = card.href || '';
                if (!href.includes('blibli.com/p/')) return;

                const text = card.innerText || '';
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                const adIdx = lines[0] === 'Ad' ? 1 : 0;
                const name = lines[adIdx] || '';

                // Price
                let price = '';
                const priceMatch = text.match(/Rp\s?([\d]{1,3}(?:\.[\d]{3})*)/);
                if (priceMatch) price = 'Rp' + priceMatch[1];

                // Rating: standalone digit line like "4.8" before "Terjual"
                let rating = null;
                const ratingMatch = text.match(/\n(\d(?:[.,]\d)?)\n/);
                if (ratingMatch) rating = parseFloat(ratingMatch[1].replace(',', '.'));

                // Sold: "Terjual 160" or "Terjual 1,3 rb+"
                let sold = null;
                const soldMatch = text.match(/Terjual\s+([\d.,]+(?:\s*rb[+]?)?)/i);
                if (soldMatch) sold = 'Terjual ' + soldMatch[1].trim();

                const imgEl = card.querySelector('img');

                if (name.length > 5 && href) {
                    items.push({
                        name: name.substring(0, 200),
                        price,
                        image: imgEl?.src || '',
                        rating,
                        sold,
                        link: href,
                        marketplace: 'blibli',
                    });
                }
            });

            return items;
        });

        console.error(`[Browser] DOM found ${domProducts.length} products`);

        // Save cookies for next API run
        try {
            const cookies = await context.cookies();
            saveCookies(cookies.filter(c => c.domain.includes('blibli')));
            console.error('[Browser] Saved cookies for next API run');
        } catch (_) {}

        await context.close();

        // ── Merge: API intercepted + DOM ──
        const merged = [...apiProducts];
        const seenLinks = new Set(apiProducts.map(p => p.link));

        for (const dp of domProducts) {
            const existing = merged.find(p => p.link === dp.link || p.name === dp.name);
            if (existing) {
                if (!existing.sold && dp.sold) existing.sold = dp.sold;
                if (!existing.rating && dp.rating) existing.rating = dp.rating;
                if (!existing.image && dp.image) existing.image = dp.image;
            } else if (!seenLinks.has(dp.link)) {
                seenLinks.add(dp.link);
                merged.push(dp);
            }
        }

        // Dedupe & limit
        const unique = [];
        const seen = new Set();
        for (const p of merged) {
            const key = p.link || p.name;
            if (!seen.has(key) && unique.length < limit) {
                seen.add(key);
                unique.push(p);
            }
        }

        return { success: unique.length > 0, data: unique, count: unique.length };

    } catch (error) {
        console.error('[Browser] Error:', error.message);
        await context.close().catch(() => {});
        return { success: false, error: error.message, data: [] };
    }
}

// ─── Main: API first → browser fallback ─────────────────────────────────────
async function scrapeBlibli(keyword, limit = 10) {
    console.error('=== Blibli Scraper ===');

    // 1️⃣  Try API first (fast, no browser)
    const cookies = loadCookies() || [];
    if (cookies.length > 0) {
        try {
            const apiUrl = `https://www.blibli.com/backend/search/products?`
                + `searchTerm=${encodeURIComponent(keyword)}`
                + `&start=0&itemPerPage=${limit}&channelId=web&listType=COLUMN&sort=7`;
            console.error('[API] Trying direct HTTP...');
            const { status, body } = await httpGet(apiUrl, cookies);
            console.error('[API] Status:', status);

            if (status === 200) {
                const json = JSON.parse(body);
                const products = parseApiProducts(json);
                if (products.length > 0) {
                    console.error('[API] Got', products.length, 'products');
                    return { success: true, data: products.slice(0, limit), count: products.length };
                }
            }
        } catch (e) {
            console.error('[API] Error:', e.message);
        }
        console.error('[API] Failed or empty, falling back to browser...');
    } else {
        console.error('[API] No cookies, going straight to browser...');
    }

    // 2️⃣  Browser fallback
    return scrapeBrowserFallback(keyword, limit);
}

// ─── Setup: open browser to pass Cloudflare manually ────────────────────────
async function setup() {
    console.error('Opening browser for Cloudflare setup...');
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        viewport: { width: 1280, height: 900 },
        locale: 'id-ID',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://www.blibli.com/cari/laptop', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.error('Pass the Cloudflare challenge in the browser window...');
    try {
        await page.waitForFunction(
            () => !document.title.includes('Tunggu') && !document.title.includes('Just a moment')
                && document.querySelectorAll('a[href*="/p/"]').length > 0,
            { timeout: 60000 }
        );
    } catch (_) { console.error('Timeout, saving whatever cookies exist.'); }
    const cookies = await context.cookies();
    saveCookies(cookies.filter(c => c.domain.includes('blibli')));
    console.error('Saved', cookies.length, 'cookies. Setup complete!');
    await context.close();
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
    if (process.argv[2] === '--setup') {
        setup().catch(e => console.error('Setup error:', e.message));
    } else {
        const keyword = process.argv[2] || 'laptop';
        const limit = parseInt(process.argv[3]) || 10;
        scrapeBlibli(keyword, limit)
            .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(r.success ? 0 : 1); })
            .catch(e => { console.log(JSON.stringify({ success: false, error: e.message, data: [] })); process.exit(1); });
    }
}

module.exports = { scrapeBlibli };
