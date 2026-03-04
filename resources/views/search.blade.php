<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PriceCompare - Bandingkan Harga Tokopedia & Blibli</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .loader {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="text-center mb-8">
            <h1 class="text-4xl font-bold text-gray-800 mb-2">🛒 PriceCompare</h1>
            <p class="text-gray-600">Bandingkan harga produk dari Tokopedia & Blibli</p>
        </div>

        <!-- Search Form -->
        <div class="max-w-2xl mx-auto mb-8">
            <form id="searchForm" class="flex gap-2">
                <input 
                    type="text" 
                    id="keyword" 
                    placeholder="Cari produk... (contoh: iphone 15, laptop gaming, airpods)"
                    class="flex-1 px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                    required
                    minlength="2"
                >
                <button 
                    type="submit" 
                    id="searchBtn"
                    class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                    🔍 Cari
                </button>
            </form>
        </div>

        <!-- Loading -->
        <div id="loading" class="hidden text-center py-12">
            <div class="loader mx-auto mb-4"></div>
            <p class="text-gray-600">Sedang mencari produk dari marketplace...</p>
            <p class="text-sm text-gray-500 mt-2">Ini mungkin memakan waktu 30-60 detik</p>
        </div>

        <!-- Error -->
        <div id="error" class="hidden max-w-2xl mx-auto bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-8">
            <p id="errorMsg"></p>
        </div>

        <!-- Results -->
        <div id="results" class="hidden">
            <!-- Stats -->
            <div id="stats" class="text-center mb-6">
                <p class="text-gray-600">
                    Menampilkan <span id="totalProducts" class="font-bold text-blue-600">0</span> produk 
                    untuk "<span id="searchKeyword" class="font-semibold"></span>"
                </p>
            </div>

            <!-- Marketplace Grid -->
            <div class="grid md:grid-cols-2 gap-6">
                <!-- Tokopedia -->
                <div class="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div class="bg-green-500 text-white px-4 py-3">
                        <h2 class="text-xl font-bold">🟢 Tokopedia</h2>
                        <p class="text-sm opacity-90"><span id="tokopediaCount">0</span> produk ditemukan</p>
                    </div>
                    <div id="tokopediaProducts" class="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                        <!-- Products will be inserted here -->
                    </div>
                </div>

                <!-- Blibli -->
                <div class="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div class="bg-blue-500 text-white px-4 py-3">
                        <h2 class="text-xl font-bold">🔵 Blibli</h2>
                        <p class="text-sm opacity-90"><span id="blibliCount">0</span> produk ditemukan</p>
                    </div>
                    <div id="blibliProducts" class="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                        <!-- Products will be inserted here -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty State -->
        <div id="emptyState" class="text-center py-12 text-gray-500">
            <p class="text-6xl mb-4">🔍</p>
            <p>Masukkan kata kunci untuk mulai mencari produk</p>
        </div>
    </div>

    <script>
        const searchForm = document.getElementById('searchForm');
        const keywordInput = document.getElementById('keyword');
        const searchBtn = document.getElementById('searchBtn');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const errorMsg = document.getElementById('errorMsg');
        const results = document.getElementById('results');
        const emptyState = document.getElementById('emptyState');

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
            searchBtn.textContent = '⏳ Mencari...';

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
                searchBtn.disabled = false;
                searchBtn.textContent = '🔍 Cari';
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

        function displayResults(data) {
            hideAll();
            results.classList.remove('hidden');

            // Update stats
            document.getElementById('totalProducts').textContent = data.total_products;
            document.getElementById('searchKeyword').textContent = data.keyword;
            document.getElementById('tokopediaCount').textContent = data.results.tokopedia.count;
            document.getElementById('blibliCount').textContent = data.results.blibli.count;

            // Render Tokopedia products
            const tokopediaContainer = document.getElementById('tokopediaProducts');
            tokopediaContainer.innerHTML = renderProducts(data.results.tokopedia.products, 'tokopedia');

            // Render Blibli products
            const blibliContainer = document.getElementById('blibliProducts');
            blibliContainer.innerHTML = renderProducts(data.results.blibli.products, 'blibli');
        }

        function renderProducts(products, marketplace) {
            if (!products || products.length === 0) {
                return '<p class="text-gray-500 text-center py-4">Tidak ada produk ditemukan</p>';
            }

            return products.map(product => {
                const baseUrl = marketplace === 'tokopedia' ? '' : 'https://www.blibli.com';
                const link = product.link.startsWith('http') ? product.link : baseUrl + product.link;
                
                return `
                    <div class="border rounded-lg p-3 hover:shadow-md transition">
                        <div class="flex gap-3">
                            <img 
                                src="${product.image || 'https://via.placeholder.com/80'}" 
                                alt="${product.name}"
                                class="w-20 h-20 object-cover rounded"
                                onerror="this.src='https://via.placeholder.com/80'"
                            >
                            <div class="flex-1 min-w-0">
                                <h3 class="font-medium text-sm line-clamp-2 mb-1" title="${product.name}">
                                    ${product.name}
                                </h3>
                                <p class="text-lg font-bold text-${marketplace === 'tokopedia' ? 'green' : 'blue'}-600">
                                    ${product.price}
                                </p>
                                <div class="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                    ${product.rating ? `<span>⭐ ${product.rating}</span>` : ''}
                                    ${product.sold ? `<span>📦 ${product.sold}</span>` : ''}
                                </div>
                                <a 
                                    href="${link}" 
                                    target="_blank"
                                    class="inline-block mt-2 text-xs text-${marketplace === 'tokopedia' ? 'green' : 'blue'}-600 hover:underline"
                                >
                                    Lihat Produk →
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    </script>
</body>
</html>
