<?php

namespace Database\Seeders\System;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §4) — le catalogue initial. Idempotent : `insertOrIgnore` sur l'unicité
 * (genre, variante, durée) — une offre existante n'est jamais réécrite, un prix réglé par la console
 * survit au seeder.
 */
class BoostProductSeeder extends Seeder
{
    /** @var list<array{kind: string, variant: ?string, duration_days: int, price_credits: int, sort_order: int}> */
    public const CATALOGUE = [
        ['kind' => 'bump', 'variant' => null, 'duration_days' => 0, 'price_credits' => 5, 'sort_order' => 10],
        ['kind' => 'featured', 'variant' => null, 'duration_days' => 7, 'price_credits' => 20, 'sort_order' => 20],
        ['kind' => 'featured', 'variant' => null, 'duration_days' => 15, 'price_credits' => 35, 'sort_order' => 21],
        ['kind' => 'featured', 'variant' => null, 'duration_days' => 30, 'price_credits' => 60, 'sort_order' => 22],
        ['kind' => 'badge', 'variant' => 'urgent', 'duration_days' => 7, 'price_credits' => 10, 'sort_order' => 30],
        ['kind' => 'badge', 'variant' => 'price_drop', 'duration_days' => 7, 'price_credits' => 10, 'sort_order' => 31],
    ];

    public function run(): void
    {
        $now = now();
        DB::table('boost_products')->insertOrIgnore(array_map(
            fn (array $offre) => $offre + ['is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            self::CATALOGUE,
        ));
    }
}
