<?php

namespace App\Services;

use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Log;

class ScraperService
{
    private string $scraperPath;
    private array $env;
    
    public function __construct()
    {
        $this->scraperPath = base_path('scraper');
        // Pass necessary environment variables for Playwright
        $this->env = [
            'USERPROFILE' => getenv('USERPROFILE') ?: $_SERVER['USERPROFILE'] ?? 'C:\\Users\\' . get_current_user(),
            'LOCALAPPDATA' => getenv('LOCALAPPDATA') ?: $_SERVER['LOCALAPPDATA'] ?? '',
            'APPDATA' => getenv('APPDATA') ?: $_SERVER['APPDATA'] ?? '',
            'TEMP' => getenv('TEMP') ?: $_SERVER['TEMP'] ?? sys_get_temp_dir(),
            'TMP' => getenv('TMP') ?: $_SERVER['TMP'] ?? sys_get_temp_dir(),
            'PATH' => getenv('PATH') ?: $_SERVER['PATH'] ?? '',
            'SystemRoot' => getenv('SystemRoot') ?: $_SERVER['SystemRoot'] ?? 'C:\\Windows',
            'HOMEPATH' => getenv('HOMEPATH') ?: $_SERVER['HOMEPATH'] ?? '',
            'HOMEDRIVE' => getenv('HOMEDRIVE') ?: $_SERVER['HOMEDRIVE'] ?? 'C:',
        ];
    }

    /**
     * Scrape products from Blibli
     */
    public function scrapeBlibli(string $keyword, int $limit = 10): array
    {
        try {
            $result = Process::path($this->scraperPath)
                ->env($this->env)
                ->timeout(240)
                ->run(['node', 'blibli-scraper.cjs', $keyword, $limit]);
            return $this->parseScraperResult($result, 'Blibli', $keyword);

        } catch (\Exception $e) {
            Log::error('Blibli scraper exception', [
                'error' => $e->getMessage(),
                'keyword' => $keyword
            ]);

            return [
                'success' => false,
                'error' => $e->getMessage(),
                'data' => []
            ];
        }
    }

    /**
     * Scrape products from Tokopedia
     */
    public function scrapeTokopedia(string $keyword, int $limit = 10): array
    {
        try {
            $result = Process::path($this->scraperPath)
                ->env($this->env)
                ->timeout(240)
                ->run(['node', 'tokopedia-api.cjs', $keyword, $limit]);
            return $this->parseScraperResult($result, 'Tokopedia', $keyword);

        } catch (\Exception $e) {
            Log::error('Tokopedia scraper exception', [
                'error' => $e->getMessage(),
                'keyword' => $keyword
            ]);

            return [
                'success' => false,
                'error' => $e->getMessage(),
                'data' => []
            ];
        }
    }

    /**
     * Run Tokopedia and Blibli scraping concurrently.
     */
    public function scrapeBothParallel(string $keyword, int $limit = 10): array
    {
        try {
            $tokopediaProcess = Process::path($this->scraperPath)
                ->env($this->env)
                ->timeout(240)
                ->start(['node', 'tokopedia-api.cjs', $keyword, $limit]);

            $blibliProcess = Process::path($this->scraperPath)
                ->env($this->env)
                ->timeout(240)
                ->start(['node', 'blibli-scraper.cjs', $keyword, $limit]);

            $tokopediaResult = $tokopediaProcess->wait();
            $blibliResult = $blibliProcess->wait();

            return [
                'tokopedia' => $this->parseScraperResult($tokopediaResult, 'Tokopedia', $keyword),
                'blibli' => $this->parseScraperResult($blibliResult, 'Blibli', $keyword),
            ];
        } catch (\Exception $e) {
            Log::error('Parallel scraper exception', [
                'error' => $e->getMessage(),
                'keyword' => $keyword,
            ]);

            return [
                'tokopedia' => [
                    'success' => false,
                    'error' => $e->getMessage(),
                    'data' => [],
                ],
                'blibli' => [
                    'success' => false,
                    'error' => $e->getMessage(),
                    'data' => [],
                ],
            ];
        }
    }

    /**
     * Scrape products from both marketplaces (Tokopedia + Blibli)
     */
    public function scrapeAll(string $keyword, int $limit = 10): array
    {
        $parallelResults = $this->scrapeBothParallel($keyword, $limit);
        $tokopediaData = $parallelResults['tokopedia'];
        $blibliData = $parallelResults['blibli'];

        return [
            'keyword' => $keyword,
            'tokopedia' => $tokopediaData,
            'blibli' => $blibliData,
            'total_products' => 
                ($tokopediaData['count'] ?? 0) + 
                ($blibliData['count'] ?? 0)
        ];
    }

    /**
     * Parse scraper process output and normalize error handling.
     */
    private function parseScraperResult($result, string $source, string $keyword): array
    {
        if ($result->failed()) {
            Log::error("{$source} scraper failed", [
                'error' => $result->errorOutput(),
                'keyword' => $keyword,
            ]);

            return [
                'success' => false,
                'error' => 'Scraping failed',
                'data' => [],
            ];
        }

        $output = $result->output();

        // Find JSON in output (skip console.error lines)
        $jsonStart = strpos($output, '{"success"');
        if ($jsonStart !== false) {
            $output = substr($output, $jsonStart);
        }

        $data = json_decode($output, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            Log::error("Failed to parse {$source} scraper output", [
                'output' => $output,
                'keyword' => $keyword,
            ]);

            return [
                'success' => false,
                'error' => 'Invalid JSON response',
                'data' => [],
            ];
        }

        return $data;
    }
}
