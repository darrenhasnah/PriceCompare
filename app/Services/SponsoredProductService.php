<?php

namespace App\Services;

class SponsoredProductService
{
    /**
     * Return sponsored products for a keyword (prototype/mock data).
     */
    public function getSponsoredProducts(string $keyword, int $limit = 20): array
    {
        $normalizedKeyword = mb_strtolower(trim($keyword));
        $campaigns = $this->campaignCatalog();

        $matched = [];
        $unmatched = [];

        foreach ($campaigns as $key => $campaign) {
            if ($key === 'generic') {
                continue;
            }

            $isMatch = false;
            foreach ($campaign['keywords'] as $term) {
                if ($normalizedKeyword !== '' && str_contains($normalizedKeyword, mb_strtolower($term))) {
                    $isMatch = true;
                    break;
                }
            }

            if ($isMatch) {
                $matched[] = $campaign;
            } else {
                $unmatched[] = $campaign;
            }
        }

        $orderedCampaigns = array_merge($matched, $unmatched, [$campaigns['generic']]);
        $effectiveLimit = min(max(1, $limit), count($orderedCampaigns));

        return array_slice(array_map(function (array $campaign) use ($keyword): array {
            return $this->mapCampaignToProduct($campaign, $keyword);
        }, $orderedCampaigns), 0, $effectiveLimit);
    }

    /**
     * Return random sponsored products for first page load (prototype/mock data).
     */
    public function getRandomSponsoredProducts(int $limit = 6): array
    {
        $campaignPool = array_values($this->campaignCatalog());
        shuffle($campaignPool);
        $effectiveLimit = min(max(1, $limit), count($campaignPool));
        $selected = array_slice($campaignPool, 0, $effectiveLimit);

        return array_map(function (array $campaign): array {
            return $this->mapCampaignToProduct($campaign, null);
        }, $selected);
    }

    /**
     * Normalize campaign payload to a sponsored product payload.
     */
    private function mapCampaignToProduct(array $campaign, ?string $keyword): array
    {
        return [
            'name' => $campaign['name'],
            'price' => $campaign['price'],
            'rating' => $campaign['rating'],
            'sold' => $campaign['sold'],
            'image' => $campaign['image'],
            'link' => $campaign['link'],
            'store' => $campaign['store'],
            'marketplace' => $campaign['marketplace'],
            'campaign' => [
                'id' => $campaign['id'],
                'name' => $campaign['campaign_name'],
                'billing_model' => $campaign['billing_model'],
                'billing_price' => $campaign['billing_price'],
                'status' => 'active',
            ],
            'is_sponsored' => true,
            'keyword_targeted' => $keyword,
        ];
    }

    /**
     * Static catalog for prototype campaign simulation.
     */
    private function campaignCatalog(): array
    {
        return [
            'laptop' => [
                'id' => 'CMP-LAPTOP-001',
                'campaign_name' => 'Laptop Gaming Booster',
                'keywords' => ['laptop', 'gaming', 'notebook'],
                'name' => 'ASUS ROG Strix G16 - Official Store',
                'price' => 'Rp18.499.000',
                'rating' => '4.9',
                'sold' => '2,3rb+ terjual',
                'image' => 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=240&q=60',
                'link' => 'https://shopee.co.id/',
                'store' => 'Shopee Official Store',
                'marketplace' => 'Shopee',
                'billing_model' => 'per_click',
                'billing_price' => 'Rp700 / klik',
            ],
            'phone' => [
                'id' => 'CMP-PHONE-002',
                'campaign_name' => 'Smartphone Flash Campaign',
                'keywords' => ['iphone', 'samsung', 'hp', 'smartphone'],
                'name' => 'Samsung Galaxy S25 12/256 - Resmi',
                'price' => 'Rp14.299.000',
                'rating' => '4.8',
                'sold' => '950+ terjual',
                'image' => 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=240&q=60',
                'link' => 'https://www.tokopedia.com/',
                'store' => 'Tokopedia Official Store',
                'marketplace' => 'Tokopedia',
                'billing_model' => 'per_day',
                'billing_price' => 'Rp50.000 / hari',
            ],
            'audio' => [
                'id' => 'CMP-AUDIO-003',
                'campaign_name' => 'Audio Hero Campaign',
                'keywords' => ['earphone', 'headset', 'airpods', 'tws'],
                'name' => 'Sony WH-1000XM6 Noise Cancelling',
                'price' => 'Rp5.299.000',
                'rating' => '4.9',
                'sold' => '500+ terjual',
                'image' => 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=240&q=60',
                'link' => 'https://www.blibli.com/',
                'store' => 'Blibli Official Store',
                'marketplace' => 'Blibli',
                'billing_model' => 'per_campaign',
                'billing_price' => 'Rp2.500.000 / campaign',
            ],
            'generic' => [
                'id' => 'CMP-GEN-999',
                'campaign_name' => 'Always On Generic Campaign',
                'keywords' => ['produk', 'promo'],
                'name' => 'Promo Pilihan Official Store',
                'price' => 'Mulai Rp99.000',
                'rating' => '4.7',
                'sold' => '10rb+ terjual',
                'image' => 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=240&q=60',
                'link' => 'https://www.tokopedia.com/',
                'store' => 'Sponsored Merchant Network',
                'marketplace' => 'Multi Marketplace',
                'billing_model' => 'per_click',
                'billing_price' => 'Rp200 / klik',
            ],
        ];
    }
}
