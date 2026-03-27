<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SearchCache;
use App\Services\ScraperService;
use App\Services\SponsoredProductService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;

class ScraperController extends Controller
{
    private ScraperService $scraperService;
    private SponsoredProductService $sponsoredProductService;
    private int $cacheTTL = 15; // minutes

    public function __construct(ScraperService $scraperService, SponsoredProductService $sponsoredProductService)
    {
        $this->scraperService = $scraperService;
        $this->sponsoredProductService = $sponsoredProductService;
    }

    /**
     * Search products from both marketplaces
     * 
     * GET /api/scrape?keyword=ssd&limit=10
     */
    public function search(Request $request)
    {
        // Increase PHP execution time for scraping
        set_time_limit(300);

        // Validation
        $validator = Validator::make($request->all(), [
            'keyword' => 'required|string|min:2|max:100',
            'limit' => 'nullable|integer|min:1|max:20',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        $keyword = $request->input('keyword');
        $limit = $request->input('limit', 10);
        $sponsoredProducts = $this->sponsoredProductService->getSponsoredProducts($keyword, 20);

        // Rate limiting: 1 request per 10 seconds per IP
        $key = 'scrape:' . $request->ip();
        
        if (RateLimiter::tooManyAttempts($key, 1)) {
            $seconds = RateLimiter::availableIn($key);
            
            return response()->json([
                'success' => false,
                'error' => 'Too many requests',
                'retry_after' => $seconds,
                'message' => "Please wait {$seconds} seconds before trying again"
            ], 429);
        }

        // Check cache
        $blibliCache = SearchCache::getValid($keyword, 'blibli');
        $tokopediaCache = SearchCache::getValid($keyword, 'tokopedia');

        $blibliData = null;
        $tokopediaData = null;
        $fromCache = ['blibli' => false, 'tokopedia' => false];

        if ($tokopediaCache) {
            $tokopediaData = $tokopediaCache->data;
            $fromCache['tokopedia'] = true;
        }

        if ($blibliCache) {
            $blibliData = $blibliCache->data;
            $fromCache['blibli'] = true;
        }

        // If both are not cached, scrape in parallel to reduce waiting time.
        if (!$fromCache['tokopedia'] && !$fromCache['blibli']) {
            RateLimiter::hit($key, 10);
            $parallelResults = $this->scraperService->scrapeBothParallel($keyword, $limit);

            $tokopediaResult = $parallelResults['tokopedia'];
            if ($tokopediaResult['success']) {
                $tokopediaData = $tokopediaResult['data'];
                SearchCache::create([
                    'keyword' => $keyword,
                    'marketplace' => 'tokopedia',
                    'data' => $tokopediaData,
                    'product_count' => count($tokopediaData),
                    'expires_at' => now()->addMinutes($this->cacheTTL),
                ]);
            } else {
                $tokopediaData = [];
            }

            $blibliResult = $parallelResults['blibli'];
            if ($blibliResult['success']) {
                $blibliData = $blibliResult['data'];
                SearchCache::create([
                    'keyword' => $keyword,
                    'marketplace' => 'blibli',
                    'data' => $blibliData,
                    'product_count' => count($blibliData),
                    'expires_at' => now()->addMinutes($this->cacheTTL),
                ]);
            } else {
                $blibliData = [];
            }
        } else {
            // Scrape individually only for marketplaces that miss cache.
            if (!$fromCache['tokopedia']) {
                RateLimiter::hit($key, 10);
                $tokopediaResult = $this->scraperService->scrapeTokopedia($keyword, $limit);

                if ($tokopediaResult['success']) {
                    $tokopediaData = $tokopediaResult['data'];
                    SearchCache::create([
                        'keyword' => $keyword,
                        'marketplace' => 'tokopedia',
                        'data' => $tokopediaData,
                        'product_count' => count($tokopediaData),
                        'expires_at' => now()->addMinutes($this->cacheTTL),
                    ]);
                } else {
                    $tokopediaData = [];
                }
            }

            if (!$fromCache['blibli']) {
                RateLimiter::hit($key, 10);
                $blibliResult = $this->scraperService->scrapeBlibli($keyword, $limit);

                if ($blibliResult['success']) {
                    $blibliData = $blibliResult['data'];
                    SearchCache::create([
                        'keyword' => $keyword,
                        'marketplace' => 'blibli',
                        'data' => $blibliData,
                        'product_count' => count($blibliData),
                        'expires_at' => now()->addMinutes($this->cacheTTL),
                    ]);
                } else {
                    $blibliData = [];
                }
            }
        }

        return response()->json([
            'success' => true,
            'keyword' => $keyword,
            'cache_ttl_minutes' => $this->cacheTTL,
            'from_cache' => $fromCache,
            'sponsored' => [
                'count' => count($sponsoredProducts),
                'placement' => 'top_search_results',
                'products' => $sponsoredProducts,
            ],
            'results' => [
                'tokopedia' => [
                    'count' => count($tokopediaData ?? []),
                    'products' => $tokopediaData ?? []
                ],
                'blibli' => [
                    'count' => count($blibliData ?? []),
                    'products' => $blibliData ?? []
                ]
            ],
            'total_products' => count($tokopediaData ?? []) + count($blibliData ?? []),
            'total_products_with_sponsored' => count($tokopediaData ?? []) + count($blibliData ?? []) + count($sponsoredProducts)
        ]);
    }

    /**
     * Clear expired cache
     * 
     * POST /api/cache/clear
     */
    public function clearCache()
    {
        $deleted = SearchCache::cleanExpired();
        
        return response()->json([
            'success' => true,
            'message' => 'Expired cache cleared',
            'deleted_count' => $deleted
        ]);
    }

    /**
     * Get cache stats
     * 
     * GET /api/cache/stats
     */
    public function cacheStats()
    {
        $total = SearchCache::count();
        $expired = SearchCache::where('expires_at', '<', now())->count();
        $valid = $total - $expired;

        return response()->json([
            'success' => true,
            'stats' => [
                'total_cache_entries' => $total,
                'valid_entries' => $valid,
                'expired_entries' => $expired,
                'cache_ttl_minutes' => $this->cacheTTL
            ]
        ]);
    }

    /**
     * Get random sponsored products for initial page load.
     *
     * GET /api/sponsored/random?limit=6
     */
    public function randomSponsored(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'limit' => 'nullable|integer|min:1|max:12',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors(),
            ], 422);
        }

        $limit = (int) $request->input('limit', 6);
        $products = $this->sponsoredProductService->getRandomSponsoredProducts($limit);

        return response()->json([
            'success' => true,
            'sponsored' => [
                'count' => count($products),
                'placement' => 'top_search_results',
                'products' => $products,
            ],
        ]);
    }
}
