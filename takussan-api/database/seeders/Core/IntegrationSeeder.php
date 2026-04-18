<?php

namespace Database\Seeders\Core;

use App\Models\Integration;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class IntegrationSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            foreach (['wave', 'orange_money'] as $provider) {
                Integration::updateOrCreate(
                    ['provider' => $provider, 'agency_id' => $agency->id],
                    [
                        'credentials' => json_encode([
                            'api_key' => Str::random(32),
                            'merchant_id' => Str::upper(Str::random(10)),
                        ]),
                        'is_active' => true,
                        'last_used_at' => Timeline::seedEnd()->subDays(random_int(1, 30)),
                        'metadata' => ['environment' => 'sandbox'],
                    ],
                );
            }
        }
    }
}
