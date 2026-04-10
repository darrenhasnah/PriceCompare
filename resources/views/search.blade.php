<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PriceCompare Marketplace Hub</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="pc-body">
    <section id="pcVantaWrap" class="pc-vanta-zone" aria-label="Immersive Header">
        <div id="pcVantaBg" class="pc-vanta-bg" aria-hidden="true"></div>

        <header id="pcTopbar" class="pc-topbar pc-topbar-minimal">
            <div class="pc-logo-wrap">
                <span class="pc-logo-dot"></span>
                <span class="pc-logo-text">PriceCompare</span>
            </div>
            <nav class="pc-nav">
                <a href="#" class="pc-nav-link">Home</a>
                <a href="#" class="pc-nav-link">Deals</a>
                <a href="#" class="pc-nav-link">FAQ</a>
            </nav>
        </header>

        <div class="pc-vanta-hero">
            <h1 class="pc-vanta-title">Cari produk terbaik lintas marketplace dalam satu halaman.</h1>
            <p class="pc-vanta-tagline">Bandingkan harga cepat, lihat sponsor aktif, lalu buka listing terbaik tanpa ribet.</p>

            <section class="pc-search-wrap pc-search-wrap-hero">
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
                    <button
                        type="button"
                        id="cancelSearchBtn"
                        class="pc-btn pc-btn-cancel hidden"
                    >
                        Batalkan
                    </button>
                </form>
            </section>
        </div>

        <div class="pc-vanta-fade" aria-hidden="true"></div>
    </section>

    <section class="pc-workspace">
        <div class="pc-page-grid">
            <aside class="pc-side-ads pc-side-ads-left" aria-label="Promo kiri">
                <article class="pc-ad-card">
                    <img class="pc-ad-media" src="https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=480&q=70" alt="Iklan flash sale HP" loading="lazy">
                    <p class="pc-ad-tag">Flash Sale</p>
                    <h3 class="pc-ad-title">HP Flagship Mulai 3 Jutaan</h3>
                    <p class="pc-ad-copy">Cocok untuk gaming, kamera jernih, dan baterai awet seharian.</p>
                    <a href="#" class="pc-ad-cta">Lihat Promo HP</a>
                </article>

                <article class="pc-ad-card">
                    <img class="pc-ad-media" src="https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=480&q=70" alt="Iklan promo laptop" loading="lazy">
                    <p class="pc-ad-tag">Best Deal</p>
                    <h3 class="pc-ad-title">Laptop Kerja & Kuliah Hemat</h3>
                    <p class="pc-ad-copy">Diskon mingguan untuk laptop tipis, RAM besar, dan SSD kencang.</p>
                    <a href="#" class="pc-ad-cta">Cek Laptop Deal</a>
                </article>
            </aside>

            <div class="pc-shell">
            <div class="pc-section-divider" aria-label="Work zone divider">
                <span class="pc-section-divider-icon">◈</span>
                <h2 class="pc-section-divider-title">Hasil Pencarian & Sponsor</h2>
            </div>

            <section class="pc-ops-wrap">
                <div class="pc-auto-refresh-panel" id="autoRefreshPanel">
                    <div class="pc-auto-refresh-left">
                        <span id="autoRefreshBadge" class="pc-auto-refresh-badge">Auto update ON</span>
                        <p id="autoRefreshHint" class="pc-auto-refresh-hint">Auto update akan aktif setelah pencarian pertama berhasil.</p>
                    </div>
                    <div class="pc-auto-refresh-right">
                        <p id="autoRefreshTimer" class="pc-auto-refresh-timer">Belum dijadwalkan</p>
                        <button type="button" id="autoRefreshToggle" class="pc-auto-refresh-toggle">Matikan Auto Update</button>
                    </div>
                </div>
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
            </div>
            <div id="sponsoredProducts" class="pc-sponsored-ticker">
                <!-- Sponsored ticker will be inserted here -->
            </div>
        </section>

        <!-- Results -->
        <section id="results" class="hidden">
            <div class="pc-inline-kpi-bar">
                <span class="pc-inline-kpi-item"><strong>Marketplace Active</strong> 2</span>
                <span class="pc-inline-kpi-sep">•</span>
                <span class="pc-inline-kpi-item"><strong>Sponsored Slots</strong> <span id="sponsoredCount">0</span></span>
                <span class="pc-inline-kpi-sep">•</span>
                <span class="pc-inline-kpi-item"><strong>Search Speed</strong> 30-60s</span>
            </div>

            <div id="stats" class="pc-stats">
                <p class="pc-stats-text">
                    Menampilkan <span id="totalProducts" class="pc-stats-value">0</span> produk 
                    untuk "<span id="searchKeyword" class="pc-stats-keyword"></span>"
                </p>
            </div>

            <div class="pc-market-grid">
                <article class="pc-market-panel pc-market-panel-tokopedia">
                    <div class="pc-market-head">
                        <h2 class="pc-market-title"><span class="pc-market-dot pc-market-dot-tokopedia"></span>Tokopedia</h2>
                        <p class="pc-market-subtitle"><span id="tokopediaCount">0</span> produk ditemukan</p>
                    </div>
                    <div id="tokopediaProducts" class="pc-market-body pc-list-stack">
                        <!-- Products will be inserted here -->
                    </div>
                </article>

                <article class="pc-market-panel pc-market-panel-blibli">
                    <div class="pc-market-head">
                        <h2 class="pc-market-title"><span class="pc-market-dot pc-market-dot-blibli"></span>Blibli</h2>
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

        <div id="autoRefreshToast" class="hidden pc-toast" role="status" aria-live="polite">
            <div class="pc-toast-content">
                <p id="autoRefreshToastText" class="pc-toast-text">Auto update akan berjalan dalam 10 detik.</p>
                <div class="pc-toast-actions">
                    <button type="button" id="stopAutoRefreshBtn" class="pc-toast-btn pc-toast-btn-stop">Berhenti</button>
                    <button type="button" id="keepAutoRefreshBtn" class="pc-toast-btn pc-toast-btn-keep">Biarkan Lanjut</button>
                </div>
            </div>
        </div>

            </div>

            <aside class="pc-side-ads pc-side-ads-right" aria-label="Promo kanan">
                <article class="pc-ad-card pc-ad-card-highlight">
                    <img class="pc-ad-media" src="https://images.unsplash.com/photo-1557821552-17105176677c?auto=format&fit=crop&w=480&q=70" alt="Iklan promo bundling gadget" loading="lazy">
                    <p class="pc-ad-tag">Promo Spesial</p>
                    <h3 class="pc-ad-title">Bundle HP + TWS + Smartwatch</h3>
                    <p class="pc-ad-copy">Paket hemat untuk upgrade gadget harian dengan harga bundling.</p>
                    <a href="#" class="pc-ad-cta">Ambil Bundling</a>
                </article>

                <article class="pc-ad-card">
                    <img class="pc-ad-media" src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=480&q=70" alt="Iklan laptop RTX creator" loading="lazy">
                    <p class="pc-ad-tag">New Arrival</p>
                    <h3 class="pc-ad-title">Laptop RTX untuk Creator</h3>
                    <p class="pc-ad-copy">Render video lebih cepat dengan performa tinggi dan pendingin stabil.</p>
                    <a href="#" class="pc-ad-cta">Lihat Seri Baru</a>
                </article>
            </aside>
        </div>

        <footer class="pc-footer-wrap" aria-label="Footer">
            <div class="pc-footer">
                <div class="pc-footer-brand">
                    <div class="pc-logo-wrap">
                        <span class="pc-logo-dot"></span>
                        <span class="pc-logo-text">PriceCompare</span>
                    </div>
                    <p class="pc-footer-tagline">Bandingkan harga lintas marketplace dengan cepat, ringkas, dan terarah.</p>
                </div>

                <div class="pc-footer-col">
                    <h3 class="pc-footer-title">Navigasi</h3>
                    <a href="#" class="pc-footer-link">Tentang</a>
                    <a href="#" class="pc-footer-link">Kontak</a>
                    <a href="#" class="pc-footer-link">FAQ</a>
                    <a href="#" class="pc-footer-link">Privacy Policy</a>
                </div>

                <div class="pc-footer-col">
                    <h3 class="pc-footer-title">Marketplace Didukung</h3>
                    <a href="#" class="pc-footer-link">Tokopedia</a>
                    <a href="#" class="pc-footer-link">Blibli</a>
                </div>

                <div class="pc-footer-meta">
                    <p>© 2026 PriceCompare. Data disediakan melalui scraping publik.</p>
                </div>
            </div>
        </footer>
    </section>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js"></script>
    <script>
        (() => {
            let vantaEffect = null;

            function initVanta() {
                if (!window.VANTA || !window.THREE) return;
                if (vantaEffect) {
                    vantaEffect.destroy();
                }

                vantaEffect = window.VANTA.NET({
                    el: '#pcVantaBg',
                    mouseControls: true,
                    touchControls: true,
                    gyroControls: false,
                    minHeight: 360,
                    minWidth: 200,
                    scale: 1,
                    scaleMobile: 1,
                    color: 0x2dd4bf,
                    backgroundColor: 0x0a0f1a,
                    points: 8,
                    maxDistance: 18,
                    spacing: 17,
                });
            }

            function onScrollTopbar() {
                if (window.scrollY > (window.innerHeight * 0.45)) {
                    document.body.classList.add('pc-scrolled');
                } else {
                    document.body.classList.remove('pc-scrolled');
                }
            }

            window.addEventListener('load', () => {
                initVanta();
                onScrollTopbar();
            });
            window.addEventListener('scroll', onScrollTopbar, { passive: true });
            window.addEventListener('beforeunload', () => {
                if (vantaEffect) {
                    vantaEffect.destroy();
                }
            });
        })();
    </script>
    <script src="/js/search-ui.js"></script>
</body>
</html>
