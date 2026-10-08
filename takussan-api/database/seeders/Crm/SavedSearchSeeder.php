<?php

namespace Database\Seeders\Crm;

use App\Models\SavedSearch;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class SavedSearchSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $users = $this->ctx->usersByAgency[$agency->id] ?? collect();
            foreach ($users as $user) {
                if (! $this->ctx->faker()->boolean(40)) {
                    continue;
                }

                $count = random_int(1, 3);
                for ($i = 1; $i <= $count; $i++) {
                    $createdAt = Timeline::randomDateBetween(
                        Timeline::seedStart(),
                        Timeline::seedEnd(),
                    );

                    SavedSearch::updateOrCreate(
                        [
                            'user_id' => $user->id,
                            'name' => "Recherche #{$i} ".$this->ctx->faker()->word(),
                        ],
                        [
                            'criteria' => [
                                'price_max' => $this->ctx->faker()->numberBetween(300_000, 2_000_000),
                                'bedrooms' => $this->ctx->faker()->numberBetween(1, 4),
                                // TCK-599 — le vocabulaire de `/properties` (`SavedSearchCriteria::KEYS`) : le
                                // quartier est `location`, une valeur, plus `neighborhoods`.
                                'location' => $this->ctx->faker()->dakarNeighborhood(),
                            ],
                            'notification_frequency' => $this->ctx->faker()->randomElement(['daily', 'weekly']),
                            'is_active' => true,
                            'created_at' => $createdAt,
                            'updated_at' => $createdAt,
                        ],
                    );
                }
            }
        }
    }
}
