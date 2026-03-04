<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SearchCache;
use App\Services\ScraperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;

class ScraperController extends Controller
{
    private ScraperService $scraperService;
    private int $cacheTTL = 15; // minutes

    public function __construct(ScraperService $scraperService)
    {
        $this->scraperService = $scraperService;
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

        // Get Tokopedia data first (cache or scrape)
        if ($tokopediaCache) {
            $tokopediaData = $tokopediaCache->data;
            $fromCache['tokopedia'] = true;
        } else {
            // Record rate limit attempt
            RateLimiter::hit($key, 10);
            
            $tokopediaResult = $this->scraperService->scrapeTokopedia($keyword, $limit);
            
            if ($tokopediaResult['success']) {
                $tokopediaData = $tokopediaResult['data'];
                
                // Save to cache
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

        // Get Blibli data (cache or scrape)
        if ($blibliCache) {
            $blibliData = $blibliCache->data;
            $fromCache['blibli'] = true;
        } else {
            // Only hit rate limiter if we're actually scraping
            if (!$fromCache['tokopedia']) {
                sleep(2); // Delay between scrapes
            } else {
                RateLimiter::hit($key, 10);
            }
            
            $blibliResult = $this->scraperService->scrapeBlibli($keyword, $limit);
            
            if ($blibliResult['success']) {
                $blibliData = $blibliResult['data'];
                
                // Save to cache
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

        return response()->json([
            'success' => true,
            'keyword' => $keyword,
            'cache_ttl_minutes' => $this->cacheTTL,
            'from_cache' => $fromCache,
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
            'total_products' => count($tokopediaData ?? []) + count($blibliData ?? [])
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
}
