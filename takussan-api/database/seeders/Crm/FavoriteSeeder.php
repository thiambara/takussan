<?php

namespace Database\Seeders\Crm;

use App\Models\Favorite;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class FavoriteSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            $users = $this->ctx->usersByAgency[$agency->id] ?? collect();
            if ($properties->isEmpty() || $users->isEmpty()) {
                continue;
            }

            $userIds = $users->pluck('id')->values();
            $propertyIds = $properties->pluck('id')->values();

            // Each user favorites 2–8 properties.
            foreach ($userIds as $userId) {
                $picks = $propertyIds->random(min(random_int(2, 8), $propertyIds->count()));
                foreach ((array) $picks->toArray() as $propertyId) {
                    $createdAt = Timeline::randomDateBetween(
                        Timeline::seedStart(),
                        Timeline::seedEnd(),
                    );
                    Favorite::updateOrCreate(
                        ['user_id' => $userId, 'property_id' => $propertyId],
                        ['created_at' => $createdAt, 'updated_at' => $createdAt],
                    );
                }
            }
        }
    }
}
