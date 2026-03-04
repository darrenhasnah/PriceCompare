const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Add stealth plugin
chromium.use(stealth);

async function scrapeTokopedia(keyword, limit = 10) {
    const browser = await chromium.launch({
        headless: false, // Visible browser to avoid detection
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'id-ID',
        extraHTTPHeaders: {
            'Accept-Language': 'id-ID,id;q=0.9',
        }
    });

    const page = await context.newPage();

    try {
        const url = `https://www.tokopedia.com/search?q=${encodeURIComponent(keyword)}`;
        
        console.error('Navigating to:', url);
        
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });

        // Wait for page
        await page.waitForTimeout(5000);

        // Close any popups
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // Scroll to load products
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.scrollBy(0, 500));
            await page.waitForTimeout(1500);
        }

        // Check current URL
        const currentUrl = page.url();
        console.error('Current URL:', currentUrl);

        // Extract products
        const products = await page.evaluate((limit) => {
            const items = [];
            
            // Find product cards - Tokopedia uses data-testid
            let productCards = document.querySelectorAll('[data-testid="master-product-card"]');
            
            if (productCards.length === 0) {
                // Alternative: find product links
                productCards = document.querySelectorAll('a[href*="/promo/"], a[href*="tokopedia.com/"]');
            }

            console.log('Found cards:', productCards.length);

            for (let i = 0; i < Math.min(productCards.length, limit); i++) {
                const card = productCards[i];
                
                try {
                    // Get link
                    const linkEl = card.tagName === 'A' ? card : card.querySelector('a');
                    const productLink = linkEl?.href || '';
                    
                    if (!productLink || productLink.includes('login') || !productLink.includes('tokopedia')) {
                        continue;
                    }

                    // Get text content
                    const textContent = card.textContent || '';

                    // Get name
                    const nameEl = card.querySelector('[data-testid="spnSRPProdName"], [data-testid="linkProductName"]');
                    let productName = nameEl?.textContent?.trim() || '';
                    
                    if (!productName) {
                        const img = card.querySelector('img');
                        productName = img?.alt || '';
                    }

                    // Get image
                    const imgEl = card.querySelector('img');
                    const productImage = imgEl?.src || imgEl?.getAttribute('data-src') || '';

                    // Get price
                    const priceEl = card.querySelector('[data-testid="spnSRPProdPrice"], [data-testid="linkProductPrice"]');
                    let productPrice = priceEl?.textContent?.trim() || '';
                    
                    if (!productPrice) {
                        const priceMatch = textContent.match(/Rp[\d.,]+/);
                        if (priceMatch) productPrice = priceMatch[0];
                    }

                    // Get rating
                    const ratingEl = card.querySelector('[data-testid="spnSRPProdRating"]');
                    let rating = null;
                    if (ratingEl) {
                        rating = parseFloat(ratingEl.textContent);
                    }

                    // Get sold
                    const soldEl = card.querySelector('[data-testid="spnSRPProdSold"]');
                    let sold = soldEl?.textContent?.trim() || null;

                    if (productName && productPrice) {
                        items.push({
                            name: productName,
                            price: productPrice,
                            image: productImage,
                            rating: rating,
                            sold: sold,
                            link: productLink,
                            marketplace: 'tokopedia'
                        });
                    }
                } catch (e) {
                    // Continue
                }
            }
            
            return items;
        }, limit);

        console.error('Scraped products:', products.length);
        
        await browser.close();
        
        return {
            success: true,
            data: products,
            count: products.length
        };

    } catch (error) {
        console.error('Scraper error:', error.message);
        await browser.close();
        return {
            success: false,
            error: error.message,
            data: []
        };
    }
}

// CLI execution
if (require.main === module) {
    const keyword = process.argv[2] || 'laptop';
    const limit = parseInt(process.argv[3]) || 10;
    
    scrapeTokopedia(keyword, limit)
        .then(result => {
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error(JSON.stringify({ 
                success: false, 
                error: error.message,
                data: [] 
            }));
            process.exit(1);
        });
}

module.exports = { scrapeTokopedia };
