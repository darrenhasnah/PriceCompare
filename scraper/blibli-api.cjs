/**
 * Blibli scraper using direct HTTP to their backend API.
 * Reads cf_clearance cookie from the persistent browser profile so we don't
 * need to re-solve Cloudflare every time.
 *
 * First time setup:
 *   node blibli-api.cjs --setup
 * This opens a visible browser so you can manually pass the CF challenge once.
 * After that, the cookie is saved in blibli-profile and reused automatically.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const PROFILE_DIR = path.join(__dirname, 'blibli-profile');
const COOKIE_CACHE = path.join(__dirname, 'blibli-cookies.json');

// ─── Read cf_clearance from Playwright persistent profile ──────────────────
function readCookiesFromProfile() {
    // Playwright stores cookies in Default/Network/Cookies (SQLite)
    // We cache them as JSON after first successful setup run
    if (fs.existsSync(COOKIE_CACHE)) {
        try {
            const data = JSON.parse(fs.readFileSync(COOKIE_CACHE, 'utf8'));
            const age = Date.now() - (data.savedAt || 0);
            // Reuse if < 12 hours old
            if (age < 12 * 60 * 60 * 1000) {
                return data.cookies;
            }
        } catch (_) {}
    }
    return null;
}

// ─── Save cookies ───────────────────────────────────────────────────────────
function saveCookies(cookies) {
    fs.writeFileSync(COOKIE_CACHE, JSON.stringify({ savedAt: Date.now(), cookies }));
}

// ─── Build cookie string ────────────────────────────────────────────────────
function cookieStr(cookies) {
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

// ─── Direct HTTP GET ────────────────────────────────────────────────────────
function httpGet(url, cookies = []) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.blibli.com/',
            'Origin': 'https://www.blibli.com',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
        };
        if (cookies.length > 0) {
            headers['Cookie'] = cookieStr(cookies);
        }

        const req = https.get(url, { headers }, (res) => {
            const chunks = [];
            // Handle gzip/deflate
            let stream = res;
            if (res.headers['content-encoding'] === 'gzip') {
                const zlib = require('zlib');
                stream = res.pipe(zlib.createGunzip());
            } else if (res.headers['content-encoding'] === 'br') {
                const zlib = require('zlib');
                stream = res.pipe(zlib.createBrotliDecompress());
            } else if (res.headers['content-encoding'] === 'deflate') {
                const zlib = require('zlib');
                stream = res.pipe(zlib.createInflate());
            }
            stream.on('data', c => chunks.push(c));
            stream.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
            stream.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('HTTP timeout')); });
    });
}

// ─── Extract products from Blibli API JSON ───────────────────────────────────
function parseBlibliResponse(json) {
    const products = [];

    // Blibli backend/search/products response structure
    const items = json?.data?.products
        || json?.data?.items
        || json?.products
        || json?.items
        || [];

    for (const item of items) {
        const p = item?.product ?? item;

        const priceObj = p.price ?? p.salePrice ?? p.finalPrice ?? {};
        let price = '';
        if (typeof priceObj === 'number') {
            price = 'Rp' + priceObj.toLocaleString('id-ID');
        } else if (typeof priceObj === 'object' && priceObj !== null) {
            const val = priceObj.minPrice ?? priceObj.value ?? priceObj.amount ?? 0;
            price = 'Rp' + Number(val).toLocaleString('id-ID');
        } else if (typeof priceObj === 'string') {
            price = priceObj;
        }

        const rating = p.rating
            ?? p.averageRating
            ?? p.reviewSummary?.rating
            ?? p.review?.rating
            ?? null;

        const soldRaw = p.soldCount
            ?? p.itemSoldCount
            ?? p.totalSold
            ?? p.reviewSummary?.transactionCount
            ?? null;
        const sold = soldRaw != null ? soldRaw + ' terjual' : null;

        const image = p.images?.[0]
            ?? p.image
            ?? p.defaultImage
            ?? p.imageUrl
            ?? '';

        const url = p.url
            ?? (p.sku ? `https://www.blibli.com/p/${p.sku}` : '');

        if (p.name && price) {
            products.push({
                name: p.name,
                price,
                image,
                rating: rating ? parseFloat(rating) : null,
                sold,
                link: url,
                marketplace: 'blibli',
            });
        }
    }

    return products;
}

// ─── Main scrape function ────────────────────────────────────────────────────
async function scrapeBlibliAPI(keyword, limit = 10) {
    const cookies = readCookiesFromProfile() || [];

    const url = `https://www.blibli.com/backend/search/products?` +
        `searchTerm=${encodeURIComponent(keyword)}` +
        `&start=0&itemPerPage=${limit}&channelId=web&listType=COLUMN` +
        `&sort=7`;  // sort=7 = terlaris (best seller)

    console.error('Calling Blibli API:', url.substring(0, 80));
    console.error('Using cookies:', cookies.length > 0 ? 'yes (' + cookies.length + ')' : 'none');

    const { status, body } = await httpGet(url, cookies);
    console.error('Response status:', status);

    if (status === 200) {
        const json = JSON.parse(body);
        const products = parseBlibliResponse(json);
        console.error('Products found:', products.length);
        return { success: products.length > 0, data: products.slice(0, limit), count: products.length };
    }

    if (status === 403 || status === 429) {
        return {
            success: false,
            error: 'Cloudflare blocked. Run: node blibli-api.cjs --setup',
            data: [],
        };
    }

    return { success: false, error: `HTTP ${status}`, data: [] };
}

// ─── Setup mode: open browser, pass CF, save cookies ───────────────────────
async function setup() {
    const { chromium } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);

    console.error('Opening browser — please pass the Cloudflare challenge manually if it appears...');
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        viewport: { width: 1280, height: 900 },
        locale: 'id-ID',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://www.blibli.com/cari/laptop', { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.error('Waiting up to 60 seconds for you to pass the CF challenge...');
    // Wait until page is no longer a CF challenge page
    try {
        await page.waitForFunction(
            () => !document.title.includes('Tunggu') && !document.title.includes('Just a moment') && document.querySelectorAll('a[href*="/p/"]').length > 0,
            { timeout: 60000 }
        );
    } catch (_) {
        console.error('Timeout — saving whatever cookies exist.');
    }

    const cookies = await context.cookies();
    saveCookies(cookies.filter(c => c.domain.includes('blibli')));
    console.error('Saved', cookies.length, 'cookies to', COOKIE_CACHE);

    await context.close();
    console.error('Setup complete! You can now run scraping normally.');
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
    if (process.argv[2] === '--setup') {
        setup().catch(e => console.error('Setup error:', e.message));
    } else {
        const keyword = process.argv[2] || 'laptop';
        const limit = parseInt(process.argv[3]) || 10;
        scrapeBlibliAPI(keyword, limit)
            .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(r.success ? 0 : 1); })
            .catch(e => { console.log(JSON.stringify({ success: false, error: e.message, data: [] })); process.exit(1); });
    }
}

module.exports = { scrapeBlibliAPI };
