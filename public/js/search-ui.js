(() => {
    const DEFAULT_AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
    const WARNING_SECONDS = 10;
    const AUTO_REFRESH_STORAGE_KEY = 'pc:auto-refresh-enabled';

    const searchForm = document.getElementById('searchForm');
    const keywordInput = document.getElementById('keyword');
    const searchBtn = document.getElementById('searchBtn');
    const cancelSearchBtn = document.getElementById('cancelSearchBtn');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMsg = document.getElementById('errorMsg');
    const results = document.getElementById('results');
    const emptyState = document.getElementById('emptyState');
    const loadingProgressBar = document.getElementById('loadingProgressBar');
    const loadingPercent = document.getElementById('loadingPercent');
    const loadingStatus = document.getElementById('loadingStatus');
    const autoRefreshBadge = document.getElementById('autoRefreshBadge');
    const autoRefreshHint = document.getElementById('autoRefreshHint');
    const autoRefreshTimer = document.getElementById('autoRefreshTimer');
    const autoRefreshToggle = document.getElementById('autoRefreshToggle');
    const autoRefreshToast = document.getElementById('autoRefreshToast');
    const autoRefreshToastText = document.getElementById('autoRefreshToastText');
    const stopAutoRefreshBtn = document.getElementById('stopAutoRefreshBtn');
    const keepAutoRefreshBtn = document.getElementById('keepAutoRefreshBtn');

    let loadingProgressTimer = null;
    let loadingStartedAt = null;
    let isSearchInProgress = false;
    let currentSearchController = null;

    let autoRefreshEnabled = true;
    let hasSuccessfulSearch = false;
    let lastSearchKeyword = '';
    let nextAutoRefreshAt = null;
    let autoRefreshTimerId = null;
    let warningShownThisCycle = false;
    let autoRefreshIntervalMs = DEFAULT_AUTO_REFRESH_INTERVAL_MS;

    loadInitialSponsored();
    loadAutoRefreshPreference();
    renderAutoRefreshState();

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const keyword = keywordInput.value.trim();
        await executeSearch(keyword, false);
    });

    if (cancelSearchBtn) {
        cancelSearchBtn.addEventListener('click', () => {
            if (isSearchInProgress && currentSearchController) {
                currentSearchController.abort();
            }
        });
    }

    if (autoRefreshToggle) {
        autoRefreshToggle.addEventListener('click', () => {
            setAutoRefreshEnabled(!autoRefreshEnabled);
        });
    }

    if (stopAutoRefreshBtn) {
        stopAutoRefreshBtn.addEventListener('click', () => {
            setAutoRefreshEnabled(false);
            hideAutoRefreshToast();
        });
    }

    if (keepAutoRefreshBtn) {
        keepAutoRefreshBtn.addEventListener('click', () => {
            warningShownThisCycle = true;
            hideAutoRefreshToast();
        });
    }

    async function executeSearch(rawKeyword, triggeredByAutoRefresh) {
        const keyword = (rawKeyword || '').trim();
        if (!keyword || keyword.length < 2) {
            showError('Kata kunci minimal 2 karakter');
            return;
        }

        if (isSearchInProgress) {
            return;
        }

        isSearchInProgress = true;
        currentSearchController = new AbortController();
        hideAutoRefreshToast();

        // Reset UI
        hideAll();
        loading.classList.remove('hidden');
        searchBtn.disabled = true;
        searchBtn.textContent = triggeredByAutoRefresh ? 'Auto Update...' : 'Memproses...';
        if (cancelSearchBtn) {
            cancelSearchBtn.classList.remove('hidden');
            cancelSearchBtn.disabled = false;
        }
        startLoadingProgress();

        try {
            const response = await fetch(`/api/scrape?keyword=${encodeURIComponent(keyword)}&limit=10`, {
                signal: currentSearchController.signal,
            });
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error(`Terlalu banyak request. Tunggu ${data.retry_after} detik.`);
                }
                throw new Error(data.error || 'Terjadi kesalahan');
            }

            if (!data.success) {
                throw new Error(data.error || 'Gagal mengambil data');
            }

            displayResults(data);
            hasSuccessfulSearch = true;
            lastSearchKeyword = keyword;
            updateAutoRefreshIntervalFromResponse(data.cache_ttl_minutes);

            if (autoRefreshEnabled) {
                scheduleNextAutoRefresh();
            } else {
                clearAutoRefreshSchedule();
                renderAutoRefreshState();
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                showError('Pencarian dibatalkan.');
                renderAutoRefreshState();
                return;
            }

            showError(err.message);

            // Keep trying in background when auto update is ON and we already have a valid previous search state.
            if (autoRefreshEnabled && hasSuccessfulSearch && triggeredByAutoRefresh) {
                scheduleNextAutoRefresh(60 * 1000);
            } else {
                renderAutoRefreshState();
            }
        } finally {
            stopLoadingProgress(true);
            searchBtn.disabled = false;
            searchBtn.textContent = 'Cari Sekarang';
            if (cancelSearchBtn) {
                cancelSearchBtn.classList.add('hidden');
                cancelSearchBtn.disabled = true;
            }
            loading.classList.add('hidden');
            isSearchInProgress = false;
            currentSearchController = null;
        }
    }

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

    function loadAutoRefreshPreference() {
        try {
            const saved = localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
            autoRefreshEnabled = saved !== 'off';
        } catch (err) {
            autoRefreshEnabled = true;
        }
    }

    function persistAutoRefreshPreference() {
        try {
            localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, autoRefreshEnabled ? 'on' : 'off');
        } catch (err) {
            // Ignore storage errors so search flow stays functional.
        }
    }

    function setAutoRefreshEnabled(enabled) {
        autoRefreshEnabled = enabled;
        persistAutoRefreshPreference();

        if (!autoRefreshEnabled) {
            clearAutoRefreshSchedule();
            hideAutoRefreshToast();
        } else if (hasSuccessfulSearch && lastSearchKeyword) {
            scheduleNextAutoRefresh();
        }

        renderAutoRefreshState();
    }

    function scheduleNextAutoRefresh(delayMs = autoRefreshIntervalMs) {
        if (!autoRefreshEnabled || !hasSuccessfulSearch || !lastSearchKeyword) {
            clearAutoRefreshSchedule();
            renderAutoRefreshState();
            return;
        }

        if (autoRefreshTimerId) {
            clearInterval(autoRefreshTimerId);
            autoRefreshTimerId = null;
        }

        warningShownThisCycle = false;
        nextAutoRefreshAt = Date.now() + delayMs;
        renderAutoRefreshState();

        autoRefreshTimerId = setInterval(() => {
            if (!autoRefreshEnabled) {
                clearAutoRefreshSchedule();
                renderAutoRefreshState();
                return;
            }

            const remainingMs = (nextAutoRefreshAt || 0) - Date.now();

            if (remainingMs <= 0) {
                triggerAutoRefresh();
                return;
            }

            if (remainingMs <= WARNING_SECONDS * 1000 && !warningShownThisCycle) {
                warningShownThisCycle = true;
                showAutoRefreshToast();
            }

            if (!autoRefreshToast.classList.contains('hidden')) {
                updateAutoRefreshToastMessage(remainingMs);
            }

            renderAutoRefreshState();
        }, 1000);
    }

    function clearAutoRefreshSchedule() {
        if (autoRefreshTimerId) {
            clearInterval(autoRefreshTimerId);
            autoRefreshTimerId = null;
        }

        nextAutoRefreshAt = null;
        warningShownThisCycle = false;
    }

    async function triggerAutoRefresh() {
        hideAutoRefreshToast();

        if (!autoRefreshEnabled || !hasSuccessfulSearch || !lastSearchKeyword) {
            clearAutoRefreshSchedule();
            renderAutoRefreshState();
            return;
        }

        if (isSearchInProgress) {
            scheduleNextAutoRefresh(15 * 1000);
            return;
        }

        await executeSearch(lastSearchKeyword, true);
    }

    function renderAutoRefreshState() {
        if (!autoRefreshBadge || !autoRefreshHint || !autoRefreshTimer || !autoRefreshToggle) {
            return;
        }

        if (!autoRefreshEnabled) {
            autoRefreshBadge.textContent = 'Auto update OFF';
            autoRefreshBadge.classList.add('off');
            autoRefreshHint.textContent = 'Auto update dimatikan. Klik nyalakan untuk aktifkan lagi kapan pun.';
            autoRefreshTimer.textContent = 'Dimatikan oleh user';
            autoRefreshToggle.textContent = 'Nyalakan Auto Update';
            return;
        }

        autoRefreshBadge.textContent = 'Auto update ON';
        autoRefreshBadge.classList.remove('off');
        autoRefreshToggle.textContent = 'Matikan Auto Update';

        if (!hasSuccessfulSearch || !lastSearchKeyword || !nextAutoRefreshAt) {
            autoRefreshHint.textContent = 'Auto update akan aktif setelah pencarian pertama berhasil.';
            autoRefreshTimer.textContent = 'Belum dijadwalkan';
            return;
        }

        const remainingMs = Math.max(0, nextAutoRefreshAt - Date.now());
        const timerLabel = formatRemaining(remainingMs);

        autoRefreshTimer.textContent = `Update berikutnya dalam ${timerLabel}`;
        if (remainingMs <= WARNING_SECONDS * 1000) {
            autoRefreshHint.textContent = `Auto scrape untuk "${lastSearchKeyword}" akan berjalan sebentar lagi.`;
        } else {
            autoRefreshHint.textContent = `Auto scrape aktif untuk kata kunci "${lastSearchKeyword}" setiap ${formatIntervalLabel(autoRefreshIntervalMs)}.`;
        }
    }

    function updateAutoRefreshIntervalFromResponse(cacheTtlMinutes) {
        const parsed = Number(cacheTtlMinutes);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            autoRefreshIntervalMs = DEFAULT_AUTO_REFRESH_INTERVAL_MS;
            return;
        }

        autoRefreshIntervalMs = Math.round(parsed * 60 * 1000);
    }

    function formatIntervalLabel(intervalMs) {
        const minutes = intervalMs / (60 * 1000);
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return '15 menit';
        }

        if (Number.isInteger(minutes)) {
            return `${minutes} menit`;
        }

        return `${minutes.toFixed(1)} menit`;
    }

    function formatRemaining(ms) {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function showAutoRefreshToast() {
        const remainingMs = Math.max(0, (nextAutoRefreshAt || 0) - Date.now());
        updateAutoRefreshToastMessage(remainingMs);
        autoRefreshToast.classList.remove('hidden');
    }

    function hideAutoRefreshToast() {
        autoRefreshToast.classList.add('hidden');
    }

    function updateAutoRefreshToastMessage(remainingMs) {
        const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
        autoRefreshToastText.textContent = `Auto update akan berjalan dalam ${seconds} detik. Klik Berhenti jika ingin mematikan otomatis.`;
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
