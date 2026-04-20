<?php

namespace Database\Seeders\Catalog;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\UserType;
use App\Models\Property;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PropertySeeder extends Seeder
{
    /** Properties created per agency. */
    private const PER_AGENCY = 100;

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $this->seedAgencyProperties($agency);
        }
    }

    private function seedAgencyProperties(Agency $agency): void
    {
        $owners = $this->ctx->usersOfType($agency->id, UserType::Individual->value);
        if ($owners->isEmpty()) {
            return;
        }

        $statusCounts = StatusDistribution::split(self::PER_AGENCY, [
            PropertyStatus::Available->value => 72,
            PropertyStatus::Rented->value => 15,
            PropertyStatus::Sold->value => 5,
            PropertyStatus::UnderMaintenance->value => 3,
            PropertyStatus::Archived->value => 2,
            PropertyStatus::Draft->value => 3,
        ]);

        $ownerIds = $owners->pluck('id')->values();

        foreach ($statusCounts as $status => $count) {
            for ($i = 0; $i < $count; $i++) {
                $createdAt = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedEnd()->subDays(7),
                );
                $ownerId = $ownerIds->random();
                $contract = $this->ctx->faker()->boolean(70)
                    ? ContractType::Rent
                    : ContractType::Sale;

                $price = $contract === ContractType::Rent
                    ? $this->ctx->faker()->numberBetween(150_000, 2_500_000)
                    : $this->ctx->faker()->numberBetween(15_000_000, 250_000_000);

                $title = ucfirst($this->ctx->faker()->words(4, true));
                $property = Property::withoutEvents(function () use (
                    $agency, $ownerId, $title, $contract, $status, $price, $createdAt
                ) {
                    return Property::create([
                        'user_id' => $ownerId,
                        'agency_id' => $agency->id,
                        'reference_number' => 'PR-'.strtoupper(Str::random(8)),
                        'title' => $title,
                        'slug' => Str::slug($title).'-'.Str::random(6),
                        'description' => $this->ctx->faker()->paragraphs(2, true),
                        'type' => $this->ctx->faker()->randomElement(PropertyType::cases())->value,
                        'contract_type' => $contract->value,
                        'status' => $status,
                        'visibility' => $status === PropertyStatus::Draft->value
                            ? PropertyVisibility::Private->value
                            : PropertyVisibility::Public->value,
                        'price' => $price,
                        'currency' => 'XOF',
                        'area' => $this->ctx->faker()->numberBetween(30, 500),
                        'bedrooms' => $this->ctx->faker()->numberBetween(1, 5),
                        'bathrooms' => $this->ctx->faker()->numberBetween(1, 3),
                        'furnished' => $this->ctx->faker()->boolean(35),
                        'floor_number' => $this->ctx->faker()->optional()->numberBetween(0, 8),
                        'total_floors' => $this->ctx->faker()->optional()->numberBetween(1, 10),
                        'year_built' => $this->ctx->faker()->numberBetween(1990, 2024),
                        'parking_spaces' => $this->ctx->faker()->numberBetween(0, 3),
                        'featured' => $this->ctx->faker()->boolean(15),
                        'available_from' => $createdAt->toDateString(),
                        'published_at' => $status === PropertyStatus::Draft->value
                            ? null
                            : $createdAt,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                });

                Address::create([
                    'addressable_id' => $property->id,
                    'addressable_type' => Property::class,
                    'street' => $this->ctx->faker()->streetAddress(),
                    'neighborhood' => $this->ctx->faker()->dakarNeighborhood(),
                    'city' => $this->ctx->faker()->senegaleseCity(),
                    'region' => 'Dakar',
                    'country' => 'SN',
                    'latitude' => $this->ctx->faker()->latitude(14.6, 14.8),
                    'longitude' => $this->ctx->faker()->longitude(-17.5, -17.3),
                ]);

                $this->ctx->registerProperty($property);
            }
        }
    }
}
