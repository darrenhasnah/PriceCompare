# PriceCompare

Aplikasi perbandingan harga produk dari **Tokopedia** dan **Blibli**. Built with Laravel + Playwright web scraping.

## Features

- 🔍 Cari produk dari Tokopedia & Blibli sekaligus
- 💰 Bandingkan harga, rating, dan jumlah terjual
- ⚡ Caching hasil pencarian (15 menit)
- 🤖 Anti-detection: stealth plugin + persistent browser profile

## Tech Stack

- **Backend:** Laravel 12 (PHP)
- **Scraper:** Node.js + Playwright + playwright-extra (stealth)
- **Frontend:** Blade + Tailwind CSS

## Setup (New Device)

### Prerequisites
- PHP 8.2+, Composer
- Node.js 18+, npm
- SQLite (default) atau MySQL

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/darrenhasnah/PriceCompare.git
cd PriceCompare

# PHP dependencies
composer install

# Node dependencies (Playwright + stealth)
npm install

# Install Playwright Chromium browser
npx playwright install chromium
```

### 2. Laravel Setup

```bash
cp .env.example .env
php artisan key:generate
php artisan migrate
```

### 3. Blibli Cloudflare Setup (wajib 1x per device)

Blibli pakai Cloudflare protection. Perlu buka browser manual 1x untuk pass challenge:

```bash
node scraper/blibli-scraper.cjs --setup
```

Browser akan terbuka → tunggu sampai halaman Blibli load → cookies otomatis tersimpan.

### 4. Run

```bash
# Terminal 1: Laravel dev server
php artisan serve

# Terminal 2: Vite (CSS/JS)
npm run dev
```

Buka http://localhost:8000 → cari produk!

## API Endpoints

| Method | Endpoint | Keterangan |
|--------|----------|------------|
| GET | `/api/scrape?keyword=laptop&limit=10` | Cari produk |
| POST | `/api/cache/clear` | Hapus cache expired |
| GET | `/api/cache/stats` | Statistik cache |

## Project Structure

```
PriceCompare/
├── app/
│   ├── Http/Controllers/Api/  → ScraperController
│   ├── Services/              → ScraperService (orchestrates scrapers)
│   └── Models/                → SearchCache
├── scraper/
│   ├── tokopedia-api.cjs      → Tokopedia scraper (GQL + DOM)
│   ├── blibli-scraper.cjs     → Blibli scraper (API + DOM fallback)
│   └── blibli-api.cjs         → Blibli direct HTTP API
├── resources/views/
│   └── search.blade.php       → Search UI
└── routes/
    ├── web.php                → GET / → search page
    └── api.php                → API routes
```

## Notes

- **Tokopedia** profile (`scraper/tokopedia-profile/`) dibuat otomatis saat pertama run
- **Blibli** perlu `--setup` karena Cloudflare. Cookie valid ~12 jam, kalau expired akan auto-fallback ke browser
- Browser profiles & cookies di-gitignore (machine-specific)
- Rate limit: 1 request per 10 detik per IP
