<?php

namespace Database\Seeders\Catalog;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Support\Search\PropertyLabels;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PropertySeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $this->seedAgencyProperties($agency);
        }
    }

    private function seedAgencyProperties(Agency $agency): void
    {
        $owners = $this->ctx->usersWithProfile(OwnerProfile::class, $agency->id);
        if ($owners->isEmpty()) {
            return;
        }

        $statusCounts = StatusDistribution::split($this->ctx->config->propertiesPerAgency, [
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

                // ~80% Dakar (avec pricing par quartier), ~20% autres villes du Sénégal.
                $isDakar = $this->ctx->faker()->boolean(80);

                if ($isDakar) {
                    $priceData = $this->ctx->faker()->senegalesePrice($contract);
                    $price = $priceData['price'];
                    $neighborhood = $priceData['neighborhood'];
                    $city = 'Dakar';
                    $region = 'Dakar';
                } else {
                    do {
                        $city = $this->ctx->faker()->senegaleseCity();
                    } while ($city === 'Dakar');
                    $neighborhood = null;
                    $region = $city;
                    $price = $contract === ContractType::Rent
                        ? $this->ctx->faker()->numberBetween(150_000, 1_500_000)
                        : $this->ctx->faker()->numberBetween(8_000_000, 80_000_000);
                }

                // Générer des caractéristiques réalistes
                $type = $this->ctx->faker()->randomElement([
                    PropertyType::Apartment,
                    PropertyType::House,
                    PropertyType::Studio,
                    PropertyType::Villa,
                    PropertyType::Shop,
                    PropertyType::Office,
                    PropertyType::Warehouse,
                    PropertyType::Land,
                    PropertyType::Room,
                    PropertyType::Garage,
                ]);
                // Studios have exactly 1 bedroom by definition.
                // TCK-506 — et un terrain, un entrepôt, un bureau n'en ont AUCUNE :
                // le seed en posait (moyenne 3,2 sur `land`), et `q=F4` aurait
                // rendu des parcelles sans la garde par type de `PropertyLabels`.
                $habitable = PropertyLabels::famille($type) === PropertyLabels::FAMILLE_HABITATION;
                $bedrooms = match (true) {
                    $type === PropertyType::Studio, $type === PropertyType::Room => 1,
                    $habitable => $this->ctx->faker()->numberBetween(1, 5),
                    default => null,
                };

                // Titre et description réalistes pour le Sénégal
                $titleLocation = $neighborhood ?? $city;
                $title = $this->ctx->faker()->senegalesePropertyTitle($type, $bedrooms ?? 0, $titleLocation);
                $description = $this->ctx->faker()->senegalesePropertyDescription($titleLocation);

                // Calculer une surface réaliste basée sur le nombre de chambres
                $area = match ($type) {
                    PropertyType::Studio => $this->ctx->faker()->numberBetween(15, 40),
                    PropertyType::Apartment => $bedrooms * 25 + $this->ctx->faker()->numberBetween(10, 30),
                    PropertyType::House, PropertyType::Villa => $bedrooms * 35 + $this->ctx->faker()->numberBetween(50, 150),
                    default => $this->ctx->faker()->numberBetween(50, 500),
                };

                $property = Property::withoutEvents(function () use (
                    $agency, $ownerId, $title, $description, $type, $contract, $status, $price, $area,
                    $bedrooms, $createdAt
                ) {
                    return Property::create([
                        'user_id' => $ownerId,
                        'agency_id' => $agency->id,
                        'reference_number' => 'PR-'.strtoupper(Str::random(8)),
                        'title' => $title,
                        'slug' => Str::slug($title).'-'.Str::random(6),
                        'description' => $description,
                        'type' => $type->value,
                        'contract_type' => $contract->value,
                        'status' => $status,
                        'visibility' => $status === PropertyStatus::Draft->value
                            ? PropertyVisibility::Private->value
                            : PropertyVisibility::Public->value,
                        'price' => $price,
                        'currency' => 'XOF',
                        'area' => $area,
                        'bedrooms' => $bedrooms,
                        'bathrooms' => $bedrooms === null ? null : min($bedrooms, $this->ctx->faker()->numberBetween(1, 3)),
                        'furnished' => $this->ctx->faker()->boolean(35),
                        'floor_number' => PropertyLabels::aUnEtage($type) ? $this->ctx->faker()->optional()->numberBetween(0, 8) : null,
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
                    'neighborhood' => $neighborhood,
                    'city' => $city,
                    'region' => $region,
                    'country' => 'SN',
                    'latitude' => $isDakar
                        ? $this->ctx->faker()->latitude(14.6, 14.8)
                        : $this->ctx->faker()->latitude(12.5, 16.7),
                    'longitude' => $isDakar
                        ? $this->ctx->faker()->longitude(-17.5, -17.3)
                        : $this->ctx->faker()->longitude(-17.5, -11.5),
                ]);

                $this->ctx->registerProperty($property);
            }
        }
    }
}
