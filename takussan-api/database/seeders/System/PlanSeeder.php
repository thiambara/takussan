<?php

namespace Database\Seeders\System;

use App\Models\Plan;
use Illuminate\Database\Seeder;

class PlanSeeder extends Seeder
{
    public function run(): void
    {
        Plan::query()->updateOrCreate(
            ['code' => 'free'],
            [
                'label' => 'Free',
                'description' => 'Plan de démarrage pour les agences en essai.',
                'monthly_price_xof' => 0,
                'platform_fee_pct' => 0,
                'trial_days' => 14,
                'limits' => [
                    'max_active_listings' => 5,
                    'max_agents' => 2,
                    'max_branches' => 1,
                ],
                'is_active' => true,
                'sort_order' => 10,
            ],
        );

        Plan::query()->updateOrCreate(
            ['code' => 'pro'],
            [
                'label' => 'Pro',
                'description' => 'Plan standard pour les agences établies.',
                'monthly_price_xof' => 50000,
                'platform_fee_pct' => 3,
                'trial_days' => 0,
                'limits' => [
                    'max_active_listings' => 100,
                    'max_agents' => 15,
                    'max_branches' => 3,
                ],
                'is_active' => true,
                'sort_order' => 20,
            ],
        );
    }
}
