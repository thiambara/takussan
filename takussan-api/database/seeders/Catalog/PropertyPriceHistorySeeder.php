<?php

namespace Database\Seeders\Catalog;

use App\Models\Enums\PriceChangeReason;
use App\Models\PropertyPriceHistory;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class PropertyPriceHistorySeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();

            foreach ($properties as $property) {
                $changes = random_int(0, 2);
                if ($changes === 0) {
                    continue;
                }

                $previous = (int) $property->price;
                for ($i = 0; $i < $changes; $i++) {
                    $delta = (int) round($previous * $this->ctx->faker()->randomFloat(3, -0.1, 0.1));
                    $newPrice = max(1, $previous + $delta);
                    $changedAt = Timeline::randomDateBetween(
                        $property->created_at,
                        Timeline::seedEnd(),
                    );

                    PropertyPriceHistory::create([
                        'property_id' => $property->id,
                        'changed_by_id' => $property->user_id,
                        'old_price' => $previous,
                        'new_price' => $newPrice,
                        'currency' => 'XOF',
                        'reason' => $this->ctx->faker()->randomElement(PriceChangeReason::cases())->value,
                        'notes' => $this->ctx->faker()->optional()->sentence(),
                        'changed_at' => $changedAt,
                        'created_at' => $changedAt,
                    ]);
                    $previous = $newPrice;
                }
            }
        }
    }
}
