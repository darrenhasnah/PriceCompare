<?php

use App\Http\Controllers\Api\ScraperController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Scraper routes
Route::get('/scrape', [ScraperController::class, 'search']);
Route::post('/cache/clear', [ScraperController::class, 'clearCache']);
Route::get('/cache/stats', [ScraperController::class, 'cacheStats']);
