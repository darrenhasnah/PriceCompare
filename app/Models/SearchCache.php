<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SearchCache extends Model
{
    protected $table = 'search_cache';

    protected $fillable = [
        'keyword',
        'marketplace',
        'data',
        'product_count',
        'expires_at',
    ];

    protected $casts = [
        'data' => 'array',
        'expires_at' => 'datetime',
    ];

    /**
     * Check if cache is still valid
     */
    public function isValid(): bool
    {
        return $this->expires_at->isFuture();
    }

    /**
     * Get cache by keyword and marketplace if still valid
     */
    public static function getValid(string $keyword, string $marketplace): ?self
    {
        return self::where('keyword', $keyword)
            ->where('marketplace', $marketplace)
            ->where('expires_at', '>', now())
            ->first();
    }

    /**
     * Clean expired cache entries
     */
    public static function cleanExpired(): int
    {
        return self::where('expires_at', '<', now())->delete();
    }
}
