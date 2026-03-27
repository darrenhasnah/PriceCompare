<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PriceCompare Marketplace Hub</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="pc-body">
    <div class="pc-shell">
        <header class="pc-topbar">
            <div class="pc-logo-wrap">
                <span class="pc-logo-dot"></span>
                <span class="pc-logo-text">PriceCompare</span>
            </div>
            <nav class="pc-nav">
                <a href="#" class="pc-nav-link">Home</a>
                <a href="#" class="pc-nav-link">Deals</a>
                <a href="#" class="pc-nav-link">Trending</a>
                <a href="#" class="pc-nav-link">Sponsored</a>
            </nav>
        </header>

        <section class="pc-hero">
            <div class="pc-hero-left">
                <p class="pc-hero-kicker">Realtime Price Discovery</p>
                <h1 class="pc-hero-title">Cari produk terbaik lintas marketplace dalam satu halaman.</h1>
                <p class="pc-hero-subtitle">Bandingkan harga, cek produk sponsor aktif, lalu buka listing terbaik tanpa pindah-pindah tab.</p>

                <div class="pc-chip-row">
                    <span class="pc-chip">Tokopedia</span>
                    <span class="pc-chip">Blibli</span>
                    <span class="pc-chip">Sponsored Slots</span>
                    <span class="pc-chip">Live Scrape</span>
                </div>
            </div>
            <aside class="pc-hero-aside">
                <div class="pc-kpi-card">
                    <p class="pc-kpi-label">Marketplace Active</p>
                    <p class="pc-kpi-value">2</p>
                </div>
                <div class="pc-kpi-card">
                    <p class="pc-kpi-label">Sponsored Slots</p>
                    <p class="pc-kpi-value"><span id="sponsoredCount">0</span></p>
                </div>
                <div class="pc-kpi-card">
                    <p class="pc-kpi-label">Search Speed</p>
                    <p class="pc-kpi-value">30-60s</p>
                </div>
            </aside>
        </section>

        <section class="pc-search-wrap">
            <form id="searchForm" class="pc-search-form">
                <input 
                    type="text" 
                    id="keyword" 
                    placeholder="Cari produk... (contoh: iphone 15, laptop gaming, airpods)"
                    class="pc-input"
                    required
                    minlength="2"
                >
                <button 
                    type="submit" 
                    id="searchBtn"
                    class="pc-btn"
                >
                    Cari Sekarang
                </button>
            </form>
        </section>

        <!-- Loading -->
        <div id="loading" class="hidden pc-loading-wrap">
            <div class="pc-loading-card">
                <div class="pc-loading-head">
                    <p class="pc-loading-title">Sedang mencari produk dari marketplace...</p>
                    <span id="loadingPercent" class="pc-loading-percent">0%</span>
                </div>
                <div class="pc-progress-track">
                    <div id="loadingProgressBar" class="pc-progress-fill progress-shimmer" style="width: 0%"></div>
                </div>
                <p id="loadingStatus" class="pc-loading-status">Menyiapkan proses scraping...</p>
                <p class="pc-loading-note">Estimasi 30-60 detik, progress mengikuti tahapan scraping di backend.</p>
            </div>
        </div>

        <!-- Error -->
        <div id="error" class="hidden pc-error-box">
            <p id="errorMsg"></p>
        </div>

        <!-- Sponsored Products -->
        <section id="sponsoredSection" class="hidden pc-sponsored-box">
            <div class="pc-sponsored-head">
                <div>
                    <h2 class="pc-sponsored-title">Sponsored Product Stream</h2>
                    <p id="sponsoredSubtitle" class="pc-sponsored-subtitle">Semua sponsor tampil dan berjalan otomatis dari kanan ke kiri.</p>
                </div>
                <span class="pc-pill">
                    <span id="sponsoredCountBadge">0</span> sponsor aktif
                </span>
            </div>
            <div id="sponsoredProducts" class="pc-sponsored-ticker">
                <!-- Sponsored ticker will be inserted here -->
            </div>
        </section>

        <!-- Results -->
        <section id="results" class="hidden">
            <div id="stats" class="pc-stats">
                <p class="pc-stats-text">
                    Menampilkan <span id="totalProducts" class="pc-stats-value">0</span> produk 
                    untuk "<span id="searchKeyword" class="pc-stats-keyword"></span>"
                </p>
            </div>

            <div class="pc-market-grid">
                <article class="pc-market-panel">
                    <div class="pc-market-head">
                        <h2 class="pc-market-title">Tokopedia</h2>
                        <p class="pc-market-subtitle"><span id="tokopediaCount">0</span> produk ditemukan</p>
                    </div>
                    <div id="tokopediaProducts" class="pc-market-body pc-list-stack">
                        <!-- Products will be inserted here -->
                    </div>
                </article>

                <article class="pc-market-panel">
                    <div class="pc-market-head">
                        <h2 class="pc-market-title">Blibli</h2>
                        <p class="pc-market-subtitle"><span id="blibliCount">0</span> produk ditemukan</p>
                    </div>
                    <div id="blibliProducts" class="pc-market-body pc-list-stack">
                        <!-- Products will be inserted here -->
                    </div>
                </article>
            </div>
        </section>

        <section id="emptyState" class="pc-empty-state">
            <p class="pc-empty-icon">◇</p>
            <h3 class="pc-empty-title">Start Discovering Products</h3>
            <p class="pc-empty-desc">Masukkan kata kunci, lalu sistem akan membandingkan produk dari Tokopedia, Blibli, dan slot sponsor aktif.</p>
        </section>
    </div>

    <script src="/js/search-ui.js"></script>
</body>
</html>
