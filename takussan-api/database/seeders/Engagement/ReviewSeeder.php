<?php

namespace Database\Seeders\Engagement;

use App\Models\Property;
use App\Models\Review;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class ReviewSeeder extends Seeder
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

            foreach ($properties as $property) {
                if (! $this->ctx->faker()->boolean(30)) {
                    continue;
                }

                $count = random_int(1, 3);
                for ($i = 0; $i < $count; $i++) {
                    $createdAt = Timeline::randomDateBetween($property->created_at, Timeline::seedEnd());
                    $isApproved = $this->ctx->faker()->boolean(80);

                    Review::create([
                        'reviewable_id' => $property->id,
                        'reviewable_type' => Property::class,
                        'author_id' => $userIds->random(),
                        'rating' => $this->ctx->faker()->numberBetween(3, 5),
                        'title' => $this->ctx->faker()->sentence(4),
                        'content' => $this->ctx->faker()->paragraph(),
                        'is_approved' => $isApproved,
                        'approved_at' => $isApproved ? $createdAt->addDays(1) : null,
                        'approved_by_id' => $isApproved ? $agency->primary_admin_id : null,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                }
            }
        }
    }
}
