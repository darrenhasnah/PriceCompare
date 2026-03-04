const { chromium } = require('playwright');

async function scrapeTokopedia(keyword, limit = 10) {
    const browser = await chromium.launch({
        headless: true,
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
    });

    const page = await context.newPage();

    try {
        const url = `https://www.tokopedia.com/search?q=${encodeURIComponent(keyword)}`;
        
        console.error('Navigating to:', url);
        
        // Navigate dengan timeout lebih lama
        await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });

        // Wait for network to be idle
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

        // Random delay untuk mimic human behavior
        await page.waitForTimeout(3000 + Math.random() * 2000);

        // Try multiple possible selectors
        const possibleSelectors = [
            '[data-testid="master-product-card"]',
            '[data-testid="divProductWrapper"]',
            '[class*="pcv3__container"]',
            'a[href*="/product/"]',
            '[class*="css-"]'
        ];

        let productSelector = null;
        for (const selector of possibleSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 5000 });
                productSelector = selector;
                console.error('Found products with selector:', selector);
                break;
            } catch (e) {
                continue;
            }
        }

        if (!productSelector) {
            console.error('No products found with any selector');
            await browser.close();
            return {
                success: false,
                error: 'No products found',
                data: []
            };
        }

        // Scroll untuk load lazy images
        await page.evaluate(() => {
            window.scrollBy(0, 800);
        });
        await page.waitForTimeout(2000);

        // Extract data produk
        const products = await page.evaluate((limit) => {
            const items = [];
            
            // Try different selectors for product cards
            let productElements = document.querySelectorAll('[data-testid="master-product-card"]');
            if (productElements.length === 0) {
                productElements = document.querySelectorAll('[data-testid="divProductWrapper"]');
            }
            if (productElements.length === 0) {
                productElements = document.querySelectorAll('[class*="pcv3__container"]');
            }
            if (productElements.length === 0) {
                // Find parent elements of product links
                const links = document.querySelectorAll('a[href*="/product/"]');
                const uniqueParents = new Set();
                links.forEach(link => {
                    let parent = link.closest('[class*="css-"]');
                    if (!parent) parent = link.parentElement;
                    if (parent) uniqueParents.add(parent);
                });
                productElements = Array.from(uniqueParents);
            }
            
            console.error('Found elements:', productElements.length);
            
            for (let i = 0; i < Math.min(productElements.length, limit); i++) {
                const element = productElements[i];
                
                try {
                    // Get product link
                    const linkElement = element.tagName === 'A' ? element : element.querySelector('a[href*="/product/"], a');
                    let productLink = '';
                    if (linkElement) {
                        const href = linkElement.getAttribute('href');
                        productLink = href && href.startsWith('http') ? href : 'https://www.tokopedia.com' + href;
                    }

                    // Get product name - try multiple selectors
                    let productName = '';
                    const nameSelectors = [
                        '[data-testid="spnSRPProdName"]',
                        '[data-testid="linkProductName"]',
                        'span[class*="prd_link-product-name"]',
                        '[class*="name"]'
                    ];
                    
                    for (const sel of nameSelectors) {
                        const nameEl = element.querySelector(sel);
                        if (nameEl && nameEl.textContent) {
                            productName = nameEl.textContent.trim();
                            if (productName) break;
                        }
                    }

                    // Get image
                    const imgElement = element.querySelector('img');
                    const productImage = imgElement ? (imgElement.getAttribute('src') || imgElement.getAttribute('data-src')) : '';

                    // Get price - multiple approaches
                    let productPrice = '';
                    const priceSelectors = [
                        '[data-testid="spnSRPProdPrice"]',
                        '[data-testid="linkProductPrice"]',
                        'span[class*="prd_link-product-price"]',
                        '[class*="price"]'
                    ];
                    
                    for (const sel of priceSelectors) {
                        const priceEl = element.querySelector(sel);
                        if (priceEl && priceEl.textContent) {
                            productPrice = priceEl.textContent.trim();
                            if (productPrice.includes('Rp') || productPrice.match(/\d/)) break;
                        }
                    }

                    // Get rating
                    let rating = null;
                    const ratingSelectors = [
                        '[data-testid="spnSRPProdRating"]',
                        '[data-testid="linkProductRating"]',
                        'span[class*="rating"]'
                    ];
                    
                    for (const sel of ratingSelectors) {
                        const ratingEl = element.querySelector(sel);
                        if (ratingEl) {
                            const ratingText = ratingEl.textContent.trim();
                            const ratingMatch = ratingText.match(/[\d.]+/);
                            if (ratingMatch) {
                                rating = parseFloat(ratingMatch[0]);
                                break;
                            }
                        }
                    }

                    // Get sold count
                    let sold = null;
                    const soldSelectors = [
                        '[data-testid="spnSRPProdSold"]',
                        '[data-testid="linkProductSold"]',
                        'span[class*="sold"]'
                    ];
                    
                    for (const sel of soldSelectors) {
                        const soldEl = element.querySelector(sel);
                        if (soldEl) {
                            const soldText = soldEl.textContent.trim();
                            const match = soldText.match(/[\d.]+[kKrb]+/);
                            if (match) {
                                sold = match[0];
                                break;
                            } else {
                                const numMatch = soldText.match(/\d+/);
                                if (numMatch) {
                                    sold = numMatch[0];
                                    break;
                                }
                            }
                        }
                    }

                    // Get review count
                    let reviewCount = null;
                    const reviewSelectors = [
                        '[data-testid="spnSRPReviewCount"]',
                        '[class*="review"]'
                    ];
                    
                    for (const sel of reviewSelectors) {
                        const reviewEl = element.querySelector(sel);
                        if (reviewEl) {
                            const reviewText = reviewEl.textContent.trim();
                            const match = reviewText.match(/\d+/);
                            if (match) {
                                reviewCount = match[0];
                                break;
                            }
                        }
                    }

                    // Only add if has essential data
                    if (productName && productPrice && productLink) {
                        items.push({
                            name: productName,
                            price: productPrice,
                            image: productImage,
                            rating: rating,
                            sold: sold,
                            review_count: reviewCount,
                            link: productLink,
                            marketplace: 'tokopedia'
                        });
                    }
                } catch (err) {
                    console.error('Error extracting product:', err.message);
                }
            }
            
            return items;
        }, limit);

        await browser.close();
        
        console.error('Scraped products:', products.length);
        
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
    const keyword = process.argv[2] || 'ssd';
    const limit = parseInt(process.argv[3]) || 10;
    
    scrapeTokopedia(keyword, limit)
        .then(result => {
            console.log(JSON.stringify(result));
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
