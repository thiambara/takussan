<?php

namespace Database\Seeders\Support;

use App\Models\Address;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\TagType;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\Tag;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Génère des entités ciblées pour couvrir tous les cas de filtres et de recherche.
 *
 * Ce seeder crée des propriétés, leases et customers avec des valeurs spécifiques
 * permettant de tester tous les filtres de l'application.
 */
class FilterCoverageSeeder extends Seeder
{
    /** Cas de prix extrêmes pour tester les filtres de range */
    private const PRICE_EDGE_CASES = [
        // Prix bas (location)
        ['price' => 50000, 'contract_type' => ContractType::Rent, 'area' => 15],
        ['price' => 100000, 'contract_type' => ContractType::Rent, 'area' => 25],
        ['price' => 250000, 'contract_type' => ContractType::Rent, 'area' => 40],
        // Prix moyens
        ['price' => 500000, 'contract_type' => ContractType::Rent, 'area' => 80],
        ['price' => 1000000, 'contract_type' => ContractType::Rent, 'area' => 150],
        ['price' => 2500000, 'contract_type' => ContractType::Rent, 'area' => 300],
        // Prix hauts (vente)
        ['price' => 15000000, 'contract_type' => ContractType::Sale, 'area' => 200],
        ['price' => 50000000, 'contract_type' => ContractType::Sale, 'area' => 400],
        ['price' => 100000000, 'contract_type' => ContractType::Sale, 'area' => 800],
        ['price' => 250000000, 'contract_type' => ContractType::Sale, 'area' => 1500],
        ['price' => 500000000, 'contract_type' => ContractType::Sale, 'area' => 3000],
    ];

    /** Configurations de chambres/salles de bain pour tester les filtres */
    private const ROOM_COMBINATIONS = [
        ['bedrooms' => 1, 'bathrooms' => 1],
        ['bedrooms' => 2, 'bathrooms' => 1],
        ['bedrooms' => 2, 'bathrooms' => 2],
        ['bedrooms' => 3, 'bathrooms' => 2],
        ['bedrooms' => 4, 'bathrooms' => 3],
        ['bedrooms' => 5, 'bathrooms' => 4],
        ['bedrooms' => 6, 'bathrooms' => 5],
    ];

    /**
     * Types de tags attachables à un BIEN — et la liste est courte pour une
     * raison métier, pas par prudence (TCK-335, étape 7).
     *
     * `TagType::Crm` désigne des CLIENTS : `VIP`, `Prospect chaud`, `Étranger`,
     * `Famille`, `Étudiant` (`database/seeders/System/TagSeeder.php`). Les
     * coller sur des biens ferait remonter un appartement sur `q=étudiant` —
     * on aurait rempli la table pivot et cassé la recherche du même geste.
     * `TagType::Label` est laissé de côté faute de vocabulaire semé.
     *
     * @var array<int,TagType>
     */
    private const PROPERTY_TAG_TYPES = [TagType::Feature, TagType::Amenity];

    /**
     * Part MINIMALE du catalogue public d'une agence qui repart taguée.
     *
     * 40 % et non « un tiers tout juste » : `EdgeCaseSeeder` crée encore des
     * biens publics APRÈS ce seeder (`YearOfActivitySeeder::PIPELINE`), et une
     * part calculée pile au tiers repasserait sous la barre de quelques unités. L'invariant qu'on veut tenir est « au moins un bien public sur
     * trois porte un tag », pas « exactement un sur trois ».
     */
    private const CATALOG_TAG_SHARE = 0.4;

    /** @var Collection<int,int>|null ids des tags attachables, résolus une fois */
    private ?Collection $propertyTagIds = null;

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        if (! $this->ctx->config->includeFilterCoverage) {
            return;
        }

        $this->command?->getOutput()?->writeln('  > Création des données de couverture de filtres...');

        foreach ($this->ctx->agencies as $agency) {
            $this->createFilterCoverageProperties($agency->id);
            $this->tagExistingCatalog($agency->id);
            $this->createFilterCoverageLeases($agency->id);
            $this->createFilterCoverageCustomers($agency->id);
        }
    }

    /**
     * Crée des properties couvrant tous les cas de filtres.
     *
     * Pour éviter une explosion combinatoire, chaque dimension d'enum est
     * itérée indépendamment (PropertyType, PropertyStatus, PropertyVisibility).
     */
    private function createFilterCoverageProperties(int $agencyId): void
    {
        $owners = $this->ctx->usersWithProfile(OwnerProfile::class, $agencyId);
        if ($owners->isEmpty()) {
            return;
        }

        $ownerId = $owners->first()->id;

        // Une property par PropertyType (couvre le filtre type)
        foreach (PropertyType::cases() as $propertyType) {
            $this->createPropertyWithAttributes($agencyId, $ownerId, [
                'type' => $propertyType,
                'featured' => true,
                'furnished' => true,
            ]);
        }

        // Une property par PropertyStatus (couvre le filtre status)
        foreach (PropertyStatus::cases() as $status) {
            $this->createPropertyWithAttributes($agencyId, $ownerId, [
                'status' => $status,
            ]);
        }

        // Une property par PropertyVisibility (couvre le filtre visibility)
        foreach (PropertyVisibility::cases() as $visibility) {
            $this->createPropertyWithAttributes($agencyId, $ownerId, [
                'visibility' => $visibility,
            ]);
        }

        // Cas de prix extrêmes
        foreach (self::PRICE_EDGE_CASES as $edgeCase) {
            $this->createPropertyWithAttributes($agencyId, $ownerId, $edgeCase);
        }

        // Combinaisons chambres/salles de bain
        foreach (self::ROOM_COMBINATIONS as $rooms) {
            $this->createPropertyWithAttributes($agencyId, $ownerId, array_merge($rooms, [
                'area' => $rooms['bedrooms'] * 25 + $rooms['bathrooms'] * 10,
            ]));
        }

        // Properties avec toutes les années de construction
        for ($year = 1990; $year <= 2024; $year += 5) {
            $this->createPropertyWithAttributes($agencyId, $ownerId, [
                'year_built' => $year,
                'parking_spaces' => ($year % 3),
            ]);
        }
    }

    /**
     * Crée une property avec des attributs spécifiques.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function createPropertyWithAttributes(int $agencyId, int $ownerId, array $attributes): void
    {
        $contractType = $attributes['contract_type'] ?? ContractType::Rent;
        $price = $attributes['price'] ?? (
            $contractType === ContractType::Rent
                ? $this->ctx->faker()->numberBetween(200000, 2000000)
                : $this->ctx->faker()->numberBetween(20000000, 100000000)
        );

        $title = 'Property Test Filter - '.Str::random(8);
        $createdAt = Timeline::randomDateBetween(Timeline::seedStart(), Timeline::seedEnd());

        $typeValue = $attributes['type'] ?? null;
        $resolvedType = $typeValue instanceof PropertyType
            ? $typeValue
            : ($typeValue !== null ? PropertyType::from($typeValue) : PropertyType::Apartment);
        $defaultBedrooms = $resolvedType === PropertyType::Studio ? 1 : 2;

        $property = Property::withoutEvents(fn () => Property::create(array_merge([
            'user_id' => $ownerId,
            'agency_id' => $agencyId,
            'reference_number' => 'PR-FC-'.strtoupper(Str::random(6)),
            'title' => $title,
            'slug' => Str::slug($title).'-'.Str::random(4),
            'description' => 'Property created for filter coverage testing.',
            'type' => PropertyType::Apartment->value,
            'contract_type' => $contractType->value,
            'status' => PropertyStatus::Available->value,
            'visibility' => PropertyVisibility::Public->value,
            'is_test' => true,
            'price' => $price,
            'currency' => 'XOF',
            'area' => $attributes['area'] ?? 100,
            'bedrooms' => $attributes['bedrooms'] ?? $defaultBedrooms,
            'bathrooms' => $attributes['bathrooms'] ?? 1,
            'furnished' => $attributes['furnished'] ?? false,
            'featured' => $attributes['featured'] ?? false,
            'floor_number' => $this->ctx->faker()->numberBetween(0, 5),
            'total_floors' => $this->ctx->faker()->numberBetween(1, 8),
            'year_built' => $attributes['year_built'] ?? 2010,
            'parking_spaces' => $attributes['parking_spaces'] ?? 1,
            'available_from' => $createdAt->toDateString(),
            'published_at' => $createdAt,
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ], $attributes)));

        // Créer une adresse
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

        $this->attachPropertyTags($property, 1, 4);

        $this->ctx->registerProperty($property);
    }

    /**
     * Passe sur le catalogue déjà semé : au moins un bien PUBLIC sur trois
     * repart avec des tags.
     *
     * Sans elle, la table pivot des taggables comptait **0 ligne** sur un jeu
     * de 836 biens (mesuré le 2026-08-21) : les 17 tags d'équipement existaient
     * et aucun bien n'en portait. Le filtre `tags=` et la facette
     * correspondante n'étaient donc **jamais exercés** en développement, et
     * rendre `tags` searchable côté moteur aurait été INVÉRIFIABLE — un index
     * juste et un index vide y sont indistinguables.
     *
     * La sélection porte sur les biens PUBLICS, et pas sur le catalogue entier :
     * c'est la population que la recherche publique interroge, et c'est donc
     * la seule sur laquelle la part se tienne sans tirage au sort. Les biens
     * non publics sont couverts par {@see createPropertyWithAttributes()}, qui
     * tague chacun de ceux qu'il crée.
     */
    private function tagExistingCatalog(int $agencyId): void
    {
        $ids = Property::query()
            ->public()
            ->where('agency_id', $agencyId)
            ->pluck('id')
            ->all();

        if ($ids === []) {
            return;
        }

        $share = (int) ceil(count($ids) * self::CATALOG_TAG_SHARE);
        $chosen = $this->ctx->faker()->randomElements($ids, min($share, count($ids)));

        Property::query()
            ->whereIn('id', $chosen)
            ->each(fn (Property $property) => $this->attachPropertyTags($property, 1, 3));
    }

    /**
     * Attache entre `$min` et `$max` tags d'équipement au bien.
     *
     * `syncWithoutDetaching` et non `attach` : la passe sur le catalogue peut
     * croiser un bien déjà tagué, et `attach` doublerait la ligne de pivot
     * (aucune clé unique ne l'en empêche).
     */
    private function attachPropertyTags(Property $property, int $min, int $max): void
    {
        $tagIds = $this->propertyTagIds();
        if ($tagIds->isEmpty()) {
            return;
        }

        $count = min($tagIds->count(), $this->ctx->faker()->numberBetween($min, $max));

        $property->tags()->syncWithoutDetaching(
            $this->ctx->faker()->randomElements($tagIds->all(), $count)
        );
    }

    /**
     * Ids des tags attachables à un bien, résolus une fois par exécution.
     *
     * @return Collection<int,int>
     */
    private function propertyTagIds(): Collection
    {
        return $this->propertyTagIds ??= Tag::query()
            ->whereIn('type', array_map(fn (TagType $type) => $type->value, self::PROPERTY_TAG_TYPES))
            ->pluck('id');
    }

    /**
     * Crée des leases couvrant tous les cas de filtres.
     *
     * Les enums sont itérés indépendamment (pas de produit cartésien) et
     * chaque lease est posé sur une property distincte pour éviter d'avoir
     * plusieurs leases Active sur la même property (incohérent métier).
     */
    private function createFilterCoverageLeases(int $agencyId): void
    {
        $properties = ($this->ctx->propertiesByAgency[$agencyId] ?? collect())->values();
        $customers = $this->ctx->customersByAgency[$agencyId] ?? collect();

        if ($properties->isEmpty() || $customers->isEmpty()) {
            return;
        }

        $pool = $properties->shuffle()->values();
        $cursor = 0;
        $pick = function () use ($pool, &$cursor): Property {
            $property = $pool[$cursor % $pool->count()];
            $cursor++;

            return $property;
        };

        // Une lease par LeaseType
        foreach (LeaseType::cases() as $leaseType) {
            $this->createLeaseWithAttributes($agencyId, $pick(), $customers->random(), [
                'type' => $leaseType->value,
            ]);
        }

        // Une lease par LeaseStatus
        foreach (LeaseStatus::cases() as $status) {
            $this->createLeaseWithAttributes($agencyId, $pick(), $customers->random(), [
                'status' => $status->value,
            ]);
        }

        // Une lease par PaymentFrequency
        foreach (PaymentFrequency::cases() as $frequency) {
            $this->createLeaseWithAttributes($agencyId, $pick(), $customers->random(), [
                'payment_frequency' => $frequency->value,
            ]);
        }

        // Cas de loyers extrêmes
        $rentAmounts = [100000, 250000, 500000, 750000, 1000000, 1500000, 2000000, 3000000];
        foreach ($rentAmounts as $rent) {
            $this->createLeaseWithAttributes($agencyId, $pick(), $customers->random(), [
                'monthly_rent' => $rent,
            ]);
        }

        // Dates de début/fin variées
        for ($monthsAgo = 1; $monthsAgo <= 12; $monthsAgo++) {
            $startDate = now()->subMonths($monthsAgo);
            $this->createLeaseWithAttributes($agencyId, $pick(), $customers->random(), [
                'start_date' => $startDate->toDateString(),
                'end_date' => $startDate->copy()->addYear()->toDateString(),
            ]);
        }
    }

    /**
     * Crée un lease avec des attributs spécifiques.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function createLeaseWithAttributes(int $agencyId, Property $property, Customer $customer, array $attributes): void
    {
        $startDateValue = $attributes['start_date'] ?? now()->subMonths(2);
        $startDate = is_string($startDateValue) ? Carbon::parse($startDateValue) : $startDateValue;

        // Si end_date est déjà fourni dans les attributs, l'utiliser, sinon calculer
        $endDate = $attributes['end_date'] ?? $startDate->copy()->addYear()->toDateString();

        $lease = Lease::withoutEvents(fn () => Lease::create(array_merge([
            'property_id' => $property->id,
            'landlord_id' => $property->user_id,
            'tenant_id' => $customer->id,
            'agency_id' => $agencyId,
            'reference_number' => 'LS-FC-'.strtoupper(Str::random(6)),
            'type' => LeaseType::ResidentialRent->value,
            'status' => LeaseStatus::Active->value,
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate,
            'monthly_rent' => 500000,
            'currency' => 'XOF',
            'deposit_amount' => 500000,
            'commission_rate' => 8.0,
            'payment_frequency' => PaymentFrequency::Monthly->value,
            'payment_day' => 5,
            'signed_at' => $startDate->copy()->subDays(2)->toDateString(),
            'created_at' => $startDate->copy()->subDays(5),
            'updated_at' => now(),
        ], $attributes)));

        $this->ctx->leases->push($lease);
    }

    /**
     * Crée des customers couvrant tous les pipeline stages.
     */
    private function createFilterCoverageCustomers(int $agencyId): void
    {
        $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agencyId);
        $addedById = $agents->isNotEmpty() ? $agents->first()->id : null;

        // Tous les pipeline stages
        foreach (CustomerPipelineStage::cases() as $stage) {
            for ($i = 0; $i < 3; $i++) {
                $firstName = $this->ctx->faker()->senegaleseFirstName();
                $lastName = $this->ctx->faker()->senegaleseLastName();

                $customer = Customer::create([
                    'user_id' => null,
                    'agency_id' => $agencyId,
                    'added_by_id' => $addedById,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => Str::slug("{$firstName} {$lastName}").'-'.Str::random(4).'@example.com',
                    'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
                    'occupation' => $this->ctx->faker()->jobTitle(),
                    'status' => CustomerStatus::Active->value,
                    'pipeline_stage' => $stage->value,
                    'created_at' => now()->subDays(random_int(1, 90)),
                    'updated_at' => now(),
                ]);

                $this->ctx->registerCustomer($customer);
            }
        }
    }
}
