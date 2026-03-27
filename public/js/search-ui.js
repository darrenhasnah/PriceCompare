(() => {
    const searchForm = document.getElementById('searchForm');
    const keywordInput = document.getElementById('keyword');
    const searchBtn = document.getElementById('searchBtn');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMsg = document.getElementById('errorMsg');
    const results = document.getElementById('results');
    const emptyState = document.getElementById('emptyState');
    const loadingProgressBar = document.getElementById('loadingProgressBar');
    const loadingPercent = document.getElementById('loadingPercent');
    const loadingStatus = document.getElementById('loadingStatus');
    let loadingProgressTimer = null;
    let loadingStartedAt = null;

    loadInitialSponsored();

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const keyword = keywordInput.value.trim();
        if (!keyword || keyword.length < 2) {
            showError('Kata kunci minimal 2 karakter');
            return;
        }

        // Reset UI
        hideAll();
        loading.classList.remove('hidden');
        searchBtn.disabled = true;
        searchBtn.textContent = 'Memproses...';
        startLoadingProgress();

        try {
            const response = await fetch(`/api/scrape?keyword=${encodeURIComponent(keyword)}&limit=10`);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error(`Terlalu banyak request. Tunggu ${data.retry_after} detik.`);
                }
                throw new Error(data.error || 'Terjadi kesalahan');
            }

            if (data.success) {
                displayResults(data);
            } else {
                throw new Error(data.error || 'Gagal mengambil data');
            }
        } catch (err) {
            showError(err.message);
        } finally {
            stopLoadingProgress(true);
            searchBtn.disabled = false;
            searchBtn.textContent = 'Cari Sekarang';
            loading.classList.add('hidden');
        }
    });

    function hideAll() {
        error.classList.add('hidden');
        results.classList.add('hidden');
        emptyState.classList.add('hidden');
    }

    function showError(msg) {
        hideAll();
        errorMsg.textContent = msg;
        error.classList.remove('hidden');
    }

    function startLoadingProgress() {
        stopLoadingProgress(false);
        loadingStartedAt = Date.now();
        updateLoadingProgress(2);

        loadingProgressTimer = setInterval(() => {
            const elapsedSec = (Date.now() - loadingStartedAt) / 1000;

            // Smooth progress model tuned for 30-60 seconds scraping window.
            let progress = 5;
            if (elapsedSec <= 20) {
                progress = 5 + (elapsedSec / 20) * 35; // 5..40
            } else if (elapsedSec <= 45) {
                progress = 40 + ((elapsedSec - 20) / 25) * 42; // 40..82
            } else {
                progress = 82 + Math.min(((elapsedSec - 45) / 35) * 12, 12); // 82..94
            }

            updateLoadingProgress(Math.min(progress, 94));
        }, 250);
    }

    function stopLoadingProgress(markAsDone) {
        if (loadingProgressTimer) {
            clearInterval(loadingProgressTimer);
            loadingProgressTimer = null;
        }

        if (markAsDone) {
            updateLoadingProgress(100);
            loadingStatus.textContent = 'Finalisasi hasil pencarian...';
        } else {
            updateLoadingProgress(0);
            loadingStatus.textContent = 'Menyiapkan proses scraping...';
        }
    }

    function updateLoadingProgress(value) {
        const clamped = Math.max(0, Math.min(100, Math.round(value)));
        loadingProgressBar.style.width = `${clamped}%`;
        loadingPercent.textContent = `${clamped}%`;

        if (clamped < 15) {
            loadingStatus.textContent = 'Menyiapkan proses scraping...';
        } else if (clamped < 45) {
            loadingStatus.textContent = 'Mengambil data Tokopedia...';
        } else if (clamped < 80) {
            loadingStatus.textContent = 'Mengambil data Blibli...';
        } else if (clamped < 100) {
            loadingStatus.textContent = 'Menyatukan dan menyusun hasil...';
        } else {
            loadingStatus.textContent = 'Selesai.';
        }
    }

    function displayResults(data) {
        hideAll();
        results.classList.remove('hidden');

        // Update stats
        document.getElementById('totalProducts').textContent = data.total_products;
        document.getElementById('searchKeyword').textContent = data.keyword;
        document.getElementById('tokopediaCount').textContent = data.results.tokopedia.count;
        document.getElementById('blibliCount').textContent = data.results.blibli.count;

        renderSponsored(data.sponsored?.products || [], false);

        // Render Tokopedia products
        const tokopediaContainer = document.getElementById('tokopediaProducts');
        tokopediaContainer.innerHTML = renderProducts(data.results.tokopedia.products, 'tokopedia');

        // Render Blibli products
        const blibliContainer = document.getElementById('blibliProducts');
        blibliContainer.innerHTML = renderProducts(data.results.blibli.products, 'blibli');
    }

    function renderProducts(products, marketplace) {
        if (!products || products.length === 0) {
            return '<p class="pc-empty-text">Tidak ada produk ditemukan</p>';
        }

        return products.map((product) => {
            const isSponsored = marketplace === 'sponsored' || product.is_sponsored;
            const baseUrl = marketplace === 'tokopedia' || marketplace === 'sponsored' ? '' : 'https://www.blibli.com';
            const link = product.link.startsWith('http') ? product.link : baseUrl + product.link;
            const sponsoredBadge = isSponsored
                ? '<span class="pc-sponsor-badge">Sponsored</span>'
                : '';
            const sponsoredMeta = isSponsored && product.campaign
                ? `<p class="pc-sponsor-meta">${product.store || 'Official Store'} • ${product.marketplace || 'Marketplace'} • ${product.campaign.billing_model.replace('_', ' ')} (${product.campaign.billing_price})</p>`
                : '';

            return `
                <div class="pc-product-card ${isSponsored ? 'pc-product-card-sponsored' : ''}">
                    <div class="pc-product-row">
                        <img
                            src="${product.image || 'https://via.placeholder.com/80'}"
                            alt="${product.name}"
                            class="pc-product-image"
                            onerror="this.src='https://via.placeholder.com/80'"
                        >
                        <div class="pc-product-main">
                            <div class="pc-product-badge-slot">${sponsoredBadge}</div>
                            <h3 class="pc-product-title" title="${product.name}">
                                ${product.name}
                            </h3>
                            <p class="pc-product-price">
                                ${product.price}
                            </p>
                            <div class="pc-product-meta">
                                ${product.rating ? `<span>⭐ ${product.rating}</span>` : ''}
                                ${product.sold ? `<span>📦 ${product.sold}</span>` : ''}
                            </div>
                            ${sponsoredMeta}
                            <a
                                href="${link}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="pc-product-link"
                            >
                                Lihat Produk →
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderSponsored(products, isPreview) {
        const sponsoredSection = document.getElementById('sponsoredSection');
        const sponsoredContainer = document.getElementById('sponsoredProducts');
        const sponsoredSubtitle = document.getElementById('sponsoredSubtitle');
        const sponsoredCount = products?.length || 0;
        const sponsoredCountBadge = document.getElementById('sponsoredCountBadge');

        document.getElementById('sponsoredCount').textContent = sponsoredCount;
        if (sponsoredCountBadge) {
            sponsoredCountBadge.textContent = sponsoredCount;
        }

        if (!sponsoredCount) {
            sponsoredSection.classList.add('hidden');
            sponsoredContainer.innerHTML = '';
            return;
        }

        sponsoredSubtitle.textContent = isPreview
            ? 'Preview sponsor berjalan otomatis sebelum user melakukan pencarian'
            : 'Slot sponsor aktif berjalan terus secara horizontal';
        sponsoredSection.classList.remove('hidden');
        sponsoredContainer.innerHTML = renderSponsoredTicker(products);
    }

    function renderSponsoredTicker(products) {
        const tickerProducts = [...products, ...products];

        return `
            <div class="pc-sponsored-track">
                ${tickerProducts.map((product) => {
                    const safeLink = product.link?.startsWith('http') ? product.link : '#';
                    const campaignName = product.campaign?.name || 'Sponsored Campaign';

                    return `
                        <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="pc-sponsored-card">
                            <img
                                src="${product.image || 'https://via.placeholder.com/120'}"
                                alt="${product.name || 'Sponsored Product'}"
                                class="pc-sponsored-image"
                                onerror="this.src='https://via.placeholder.com/120'"
                            >
                            <div class="pc-sponsored-content">
                                <p class="pc-sponsored-store">${product.store || 'Official Store'}</p>
                                <h3 class="pc-sponsored-name">${product.name || 'Sponsored Product'}</h3>
                                <p class="pc-sponsored-price">${product.price || '-'}</p>
                                <p class="pc-sponsored-campaign">${campaignName}</p>
                            </div>
                        </a>
                    `;
                }).join('')}
            </div>
        `;
    }

    async function loadInitialSponsored() {
        try {
            const response = await fetch('/api/sponsored/random?limit=8');
            const data = await response.json();

            if (response.ok && data.success) {
                renderSponsored(data.sponsored?.products || [], true);
            }
        } catch (err) {
            // Keep page usable even if sponsored preview fails.
        }
    }
})();
