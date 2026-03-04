const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function scrapeTokopediaManual(keyword, limit = 10) {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-gpu',
        ],
    });

    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        locale: 'id-ID',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    let products = [];

    // Intercept GQL API responses
    page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();
        if (url.includes('tokopedia.com') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('.woff') && status === 200) {
            console.error('Network response:', url.substring(0, 100));
        }
        if (url.includes('gql') || url.includes('graphql') || url.includes('search') || url.includes('api')) {
            try {
                const json = await response.json();
                const found = extractProducts(json);
                if (found.length > 0) {
                    console.error('Found', found.length, 'products from:', url.substring(0, 80));
                    products.push(...found);
                }
            } catch (e) {}
        }
    });

    try {
        // Go directly to search
        const url = `https://www.tokopedia.com/search?q=${encodeURIComponent(keyword)}`;
        console.error('Navigating to:', url);
        
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });

        // Wait for products to appear (Tokopedia is React SPA - needs time)
        console.error('Waiting for products to render...');
        try {
            await page.waitForSelector('[data-testid="master-product-card"], [data-testid="product-card"], [data-testid="divProductWrapper"]', { timeout: 20000 });
            console.error('Product cards found!');
        } catch (e) {
            console.error('Product card selector timeout, waiting extra time...');
            await page.waitForTimeout(8000);
        }

        // Scroll to trigger lazy loading
        for (let i = 0; i < 4; i++) {
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(800);
        }

        // Wait for more API calls
        await page.waitForTimeout(2000);

        // If no API data, try DOM scraping
        if (products.length === 0) {
            console.error('No API data, trying DOM scraping...');

            // Debug: dump article and testid info
            const title = await page.title();
            const debugInfo = await page.evaluate(() => {
                const articles = document.querySelectorAll('article');
                const testids = document.querySelectorAll('[data-testid]');
                return {
                    articleCount: articles.length,
                    testidSamples: Array.from(testids).slice(0, 8).map(el => el.getAttribute('data-testid') + ': ' + el.textContent?.substring(0, 40)),
                    firstArticleHtml: articles[0]?.outerHTML?.substring(0, 600) || 'none',
                };
            });
            console.error('Page title:', title);
            console.error('Debug:', JSON.stringify(debugInfo, null, 2));
            
            products = await page.evaluate(() => {
                const items = [];

                // Try multiple Tokopedia card selectors
                const selectors = [
                    '[data-testid="master-product-card"]',
                    '[data-testid="product-card"]',
                    'article',
                    '.css-5wh65g',
                    '[class*="ProductCard"]',
                ];

                let cards = [];
                for (const sel of selectors) {
                    const found = document.querySelectorAll(sel);
                    if (found.length > 2) { cards = Array.from(found); break; }
                }

                // Fallback: links matching product URL pattern
                if (cards.length === 0) {
                    const seen = new Set();
                    document.querySelectorAll('a[href*="tokopedia.com/"]').forEach(link => {
                        if (link.href.match(/tokopedia\.com\/[^\/]+\/[^\/\?]+/) &&
                            !link.href.includes('/search') && !link.href.includes('/promo')) {
                            const card = link.closest('div[class]') || link.parentElement;
                            if (card && !seen.has(card)) { seen.add(card); cards.push(card); }
                        }
                    });
                }

                for (const card of cards) {
                    const text = card.textContent || '';
                    const img = card.querySelector('img');
                    const link = card.querySelector('a[href*="tokopedia.com/"]');
                    const priceMatch = text.match(/Rp[\s]?[\d.,]+/);
                    const name = img?.alt || link?.getAttribute('title') || text.split('Rp')[0]?.trim().substring(0, 100) || '';
                    const price = priceMatch ? priceMatch[0].replace(/\s/g, '') : '';

                    if (name && price && items.length < 20) {
                        items.push({ name, price, image: img?.src || '', link: link?.href || '', marketplace: 'tokopedia' });
                    }
                }

                return items;
            });
        }

        await browser.close();

        // Dedupe
        const unique = [];
        const seen = new Set();
        for (const p of products) {
            const key = p.name + p.price;
            if (!seen.has(key) && unique.length < limit) {
                seen.add(key);
                unique.push(p);
            }
        }

        return {
            success: true,
            data: unique,
            count: unique.length
        };

    } catch (error) {
        console.error('Error:', error.message);
        await browser.close();
        return {
            success: false,
            error: error.message,
            data: []
        };
    }
}

function extractProducts(obj, products = []) {
    if (!obj || typeof obj !== 'object') return products;
    
    // Look for product-like objects
    if (obj.name && obj.price && obj.url) {
        // Handle price object
        let priceStr = '';
        if (typeof obj.price === 'object') {
            priceStr = obj.price.text || obj.price.fmt || obj.price.value || JSON.stringify(obj.price);
        } else {
            priceStr = String(obj.price);
        }
        
        // Also check priceRange
        if (priceStr === '[object Object]' && obj.priceRange) {
            priceStr = obj.priceRange;
        }
        
        // Get image URL - Tokopedia uses mediaURL.image or mediaURL.image300
        let imageUrl = '';
        if (obj.mediaURL && typeof obj.mediaURL === 'object') {
            imageUrl = obj.mediaURL.image300 || obj.mediaURL.image || '';
        } else {
            imageUrl = obj.imageUrl || obj.image_url || obj.mediaUrl || 
                      obj.imageUri || obj.image || obj.thumbnail || '';
        }
        
        products.push({
            name: String(obj.name),
            price: priceStr,
            image: imageUrl,
            rating: obj.rating || obj.ratingAverage || null,
            sold: obj.countSold || obj.sold || obj.labelGroups?.[0]?.title || null,
            link: obj.url || '',
            marketplace: 'tokopedia'
        });
    }
    
    // Recurse
    if (Array.isArray(obj)) {
        obj.forEach(item => extractProducts(item, products));
    } else {
        Object.values(obj).forEach(val => {
            if (typeof val === 'object') extractProducts(val, products);
        });
    }
    
    return products;
}

// CLI
if (require.main === module) {
    const keyword = process.argv[2] || 'laptop';
    const limit = parseInt(process.argv[3]) || 10;
    
    scrapeTokopediaManual(keyword, limit)
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(err => {
            console.error(JSON.stringify({ success: false, error: err.message, data: [] }));
        });
}

module.exports = { scrapeTokopediaManual };
