<?php

namespace Database\Seeders\Support;

use App\Models\Address;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\ContractType;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Génère des données de cas limites pour tester les comportements spéciaux.
 *
 * Crée des entités avec des dates extrêmes, des montants particuliers,
 * ou des combinaisons d'états inhabituels pour valider la robustesse de l'application.
 */
class EdgeCaseSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        if (! $this->ctx->config->includeEdgeCases) {
            return;
        }

        $this->command?->getOutput()?->writeln('  > Création des données de cas limites...');

        foreach ($this->ctx->agencies as $agency) {
            $this->createLeaseEdgeCases($agency->id);
            $this->createBookingEdgeCases($agency->id);
            $this->createPropertyEdgeCases($agency->id);
            $this->createCustomerEdgeCases($agency->id);
            $this->createMaintenanceEdgeCases($agency->id);
        }
    }

    /**
     * Crée des cas limites pour les leases.
     */
    private function createLeaseEdgeCases(int $agencyId): void
    {
        $properties = $this->ctx->propertiesByAgency[$agencyId] ?? collect();
        $customers = $this->ctx->customersByAgency[$agencyId] ?? collect();

        if ($properties->isEmpty() || $customers->isEmpty()) {
            return;
        }

        // 1. Lease qui expire aujourd'hui
        $this->createLeaseWithDates(
            $agencyId,
            $properties->random(),
            $customers->random(),
            now()->subMonths(11),
            now(),
            LeaseStatus::Active
        );

        // 2. Lease qui a commencé hier
        $this->createLeaseWithDates(
            $agencyId,
            $properties->random(),
            $customers->random(),
            now()->subDay(),
            now()->addYear(),
            LeaseStatus::Active
        );

        // 3. Lease terminé hier
        $this->createLeaseWithDates(
            $agencyId,
            $properties->random(),
            $customers->random(),
            now()->subYear()->subDay(),
            now()->subDay(),
            LeaseStatus::Terminated,
            ['terminated_at' => now()->subDay()]
        );

        // 4. Lease avec loyer très bas
        $this->createLeaseWithRent($agencyId, $properties->random(), $customers->random(), 75000);

        // 5. Lease avec loyer très haut
        $this->createLeaseWithRent($agencyId, $properties->random(), $customers->random(), 5000000);

        // 6. Lease expiré depuis longtemps
        $this->createLeaseWithDates(
            $agencyId,
            $properties->random(),
            $customers->random(),
            now()->subYears(2),
            now()->subYear(),
            LeaseStatus::Expired
        );

        // 7. Lease en draft depuis longtemps
        $this->createLeaseWithDates(
            $agencyId,
            $properties->random(),
            $customers->random(),
            now()->addMonth(),
            now()->addYear()->addMonth(),
            LeaseStatus::Draft,
            ['signed_at' => null]
        );
    }

    /**
     * Crée des cas limites pour les bookings.
     */
    private function createBookingEdgeCases(int $agencyId): void
    {
        $properties = $this->ctx->propertiesByAgency[$agencyId] ?? collect();
        $customers = $this->ctx->customersByAgency[$agencyId] ?? collect();
        $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agencyId);

        if ($properties->isEmpty() || $customers->isEmpty()) {
            return;
        }

        // 1. Booking expirant aujourd'hui
        $this->createBookingWithStatus(
            $agencyId,
            $properties->random(),
            $customers->random(),
            $agents->isNotEmpty() ? $agents->random()->id : null,
            BookingStatus::Pending,
            ['expires_at' => now()->endOfDay()]
        );

        // 2. Booking annulé par le customer
        $this->createBookingWithStatus(
            $agencyId,
            $properties->random(),
            $customers->random(),
            $agents->isNotEmpty() ? $agents->random()->id : null,
            BookingStatus::Cancelled,
            [
                'cancelled_at' => now()->subDays(2),
                'cancellation_by' => CancellationBy::Customer->value,
                'cancellation_reason' => 'Changement de plans',
            ]
        );

        // 3. Booking annulé par l'agent
        $this->createBookingWithStatus(
            $agencyId,
            $properties->random(),
            $customers->random(),
            $agents->isNotEmpty() ? $agents->random()->id : null,
            BookingStatus::Cancelled,
            [
                'cancelled_at' => now()->subDays(3),
                'cancellation_by' => CancellationBy::Agent->value,
                'cancellation_reason' => 'Propriété non disponible',
            ]
        );

        // 4. Booking confirmé avec montant très bas
        $this->createBookingWithAmount(
            $agencyId,
            $properties->random(),
            $customers->random(),
            $agents->isNotEmpty() ? $agents->random()->id : null,
            50000,
            10000
        );

        // 5. Booking confirmé avec montant très haut
        $this->createBookingWithAmount(
            $agencyId,
            $properties->random(),
            $customers->random(),
            $agents->isNotEmpty() ? $agents->random()->id : null,
            5000000,
            1000000
        );

        // 6. Booking expiré depuis longtemps
        $this->createBookingWithStatus(
            $agencyId,
            $properties->random(),
            $customers->random(),
            $agents->isNotEmpty() ? $agents->random()->id : null,
            BookingStatus::Expired,
            [
                'expires_at' => now()->subMonth(),
                'expired_at' => now()->subMonth()->addDay(),
            ]
        );
    }

    /**
     * Crée des cas limites pour les properties.
     */
    private function createPropertyEdgeCases(int $agencyId): void
    {
        $owners = $this->ctx->usersWithProfile(OwnerProfile::class, $agencyId);
        if ($owners->isEmpty()) {
            return;
        }

        $ownerId = $owners->first()->id;

        // 1. Property avec 0 visite, 0 booking (inactive)
        Property::withoutEvents(fn () => Property::create([
            'user_id' => $ownerId,
            'agency_id' => $agencyId,
            'reference_number' => 'PR-EC-'.strtoupper(Str::random(6)),
            'title' => 'Property Sans Activité - Edge Case',
            'slug' => 'property-sans-activite-'.Str::random(4),
            'description' => 'Cette propriété n\'a ni visites ni bookings.',
            'type' => PropertyType::Apartment->value,
            'contract_type' => ContractType::Rent->value,
            'status' => PropertyStatus::Draft->value,
            'visibility' => PropertyVisibility::Private->value,
            'price' => 500000,
            'currency' => 'XOF',
            'area' => 50,
            'bedrooms' => 1,
            'bathrooms' => 1,
            'featured' => false,
            'published_at' => null,
            'created_at' => now()->subDays(60),
            'updated_at' => now(),
        ]));

        // 2. Property avec surface minimale
        $this->createPropertyWithSpecifics($agencyId, $ownerId, [
            'area' => 10,
            'bedrooms' => 0,
            'bathrooms' => 1,
            'title' => 'Micro Studio 10m²',
            'description' => 'Plus petite propriété disponible.',
        ]);

        // 3. Property avec surface maximale
        $this->createPropertyWithSpecifics($agencyId, $ownerId, [
            'area' => 5000,
            'bedrooms' => 10,
            'bathrooms' => 8,
            'title' => 'Villa Luxe 5000m²',
            'description' => 'Plus grande propriété disponible.',
        ]);

        // 4. Property featured avec prix premium
        // TCK-163 — flagged as test data so the implausible 999,999,999 F CFA
        // sticker price never leaks into the public listing/home rows.
        $premiumProperty = $this->createPropertyWithSpecifics($agencyId, $ownerId, [
            'featured' => true,
            'price' => 999999999,
            'title' => 'Propriété Premium Featured',
            'contract_type' => ContractType::Sale,
            'is_test' => true,
        ]);

        Address::create([
            'addressable_id' => $premiumProperty->id,
            'addressable_type' => Property::class,
            'street' => 'VDN - Corniche Ouest',
            'neighborhood' => 'Almadies',
            'city' => 'Dakar',
            'region' => 'Dakar',
            'country' => 'SN',
            'latitude' => 14.7167,
            'longitude' => -17.4677,
        ]);

        $premiumProperty->forceFill(['metadata' => [
            'media_placeholders' => [
                'https://picsum.photos/seed/property-ec-premium-1/800/600',
                'https://picsum.photos/seed/property-ec-premium-2/800/600',
                'https://picsum.photos/seed/property-ec-premium-3/800/600',
            ],
        ]])->saveQuietly();

        // 5. Property en maintenance depuis longtemps
        $this->createPropertyWithSpecifics($agencyId, $ownerId, [
            'status' => PropertyStatus::UnderMaintenance->value,
            'title' => 'Property En Maintenance Longue',
            'created_at' => now()->subDays(180),
        ]);
    }

    /**
     * Crée des cas limites pour les customers.
     */
    private function createCustomerEdgeCases(int $agencyId): void
    {
        $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agencyId);
        $addedById = $agents->isNotEmpty() ? $agents->first()->id : null;

        // 1. Customer sans aucune activité (nouveau)
        Customer::create([
            'user_id' => null,
            'agency_id' => $agencyId,
            'added_by_id' => $addedById,
            'first_name' => 'Nouveau',
            'last_name' => 'Client',
            'email' => 'nouveau.client.'.Str::random(4).'@example.com',
            'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
            'occupation' => 'Étudiant',
            'status' => CustomerStatus::Active->value,
            'pipeline_stage' => CustomerPipelineStage::Lead->value,
            'created_at' => now()->subHours(2),
            'updated_at' => now(),
        ]);

        // 2. Customer avec statut Inactive
        Customer::create([
            'user_id' => null,
            'agency_id' => $agencyId,
            'added_by_id' => $addedById,
            'first_name' => 'Client',
            'last_name' => 'Inactif',
            'email' => 'client.inactif.'.Str::random(4).'@example.com',
            'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
            'occupation' => 'Retraité',
            'status' => CustomerStatus::Inactive->value,
            'pipeline_stage' => CustomerPipelineStage::Lost->value,
            'created_at' => now()->subYear(),
            'updated_at' => now()->subMonths(6),
        ]);

        // 3. Customer Converti (recevra une activité via ReferentialIntegrityChecker)
        Customer::create([
            'user_id' => null,
            'agency_id' => $agencyId,
            'added_by_id' => $addedById,
            'first_name' => 'Client',
            'last_name' => 'Fidèle',
            'email' => 'client.fidele.'.Str::random(4).'@example.com',
            'phone' => $this->ctx->faker()->senegalesePhoneNumber(),
            'occupation' => 'Cadre',
            'status' => CustomerStatus::Active->value,
            'pipeline_stage' => CustomerPipelineStage::Converted->value,
            'created_at' => now()->subYears(3),
            'updated_at' => now(),
        ]);
    }

    /**
     * Crée des cas limites pour les maintenance requests.
     */
    private function createMaintenanceEdgeCases(int $agencyId): void
    {
        $properties = $this->ctx->propertiesByAgency[$agencyId] ?? collect();

        if ($properties->isEmpty()) {
            return;
        }

        // 1. Maintenance ouverte depuis 6 mois
        $longOpen = $properties->random();
        MaintenanceRequest::create([
            'property_id' => $longOpen->id,
            'requester_id' => $longOpen->user_id,
            'assigned_to' => null,
            'title' => 'Maintenance ouverte depuis 6 mois',
            'description' => 'Cette demande de maintenance est restée ouverte très longtemps.',
            'category' => MaintenanceCategory::Other->value,
            'priority' => MaintenancePriority::Low->value,
            'status' => MaintenanceStatus::Open->value,
            'estimated_cost' => 50000,
            'created_at' => now()->subMonths(6),
            'updated_at' => now()->subMonths(5),
        ]);

        // 2. Maintenance urgente complétée rapidement
        $urgent = $properties->random();
        MaintenanceRequest::create([
            'property_id' => $urgent->id,
            'requester_id' => $urgent->user_id,
            'assigned_to' => null,
            'title' => 'Urgence réparée en 2h',
            'description' => 'Problème urgent résolu très rapidement.',
            'category' => MaintenanceCategory::Plumbing->value,
            'priority' => MaintenancePriority::Urgent->value,
            'status' => MaintenanceStatus::Completed->value,
            'estimated_cost' => 150000,
            'actual_cost' => 125000,
            'scheduled_at' => now()->subDays(5),
            'started_at' => now()->subDays(5),
            'completed_at' => now()->subDays(5)->addHours(2),
            'resolution_notes' => 'Réparé en 2 heures seulement.',
            'created_at' => now()->subDays(5),
            'updated_at' => now()->subDays(5)->addHours(2),
        ]);

        // 3. Maintenance annulée
        $cancelled = $properties->random();
        MaintenanceRequest::create([
            'property_id' => $cancelled->id,
            'requester_id' => $cancelled->user_id,
            'assigned_to' => null,
            'title' => 'Maintenance annulée par le locataire',
            'description' => 'Le locataire a annulé sa demande.',
            'category' => MaintenanceCategory::Electrical->value,
            'priority' => MaintenancePriority::Normal->value,
            'status' => MaintenanceStatus::Cancelled->value,
            'estimated_cost' => 80000,
            'created_at' => now()->subWeek(),
            'updated_at' => now()->subDays(3),
        ]);
    }

    /**
     * Crée un lease avec des dates spécifiques.
     *
     * @param  array<string, mixed>  $extraAttributes
     */
    private function createLeaseWithDates(
        int $agencyId,
        Property $property,
        Customer $customer,
        \DateTimeInterface $startDate,
        \DateTimeInterface $endDate,
        LeaseStatus $status,
        array $extraAttributes = []
    ): void {
        $lease = Lease::withoutEvents(fn () => Lease::create(array_merge([
            'property_id' => $property->id,
            'landlord_id' => $property->user_id,
            'tenant_id' => $customer->id,
            'agency_id' => $agencyId,
            'reference_number' => 'LS-EC-'.strtoupper(Str::random(6)),
            'type' => LeaseType::ResidentialRent->value,
            'status' => $status->value,
            'start_date' => $startDate->format('Y-m-d'),
            'end_date' => $endDate->format('Y-m-d'),
            'monthly_rent' => 500000,
            'currency' => 'XOF',
            'deposit_amount' => 500000,
            'commission_rate' => 8.0,
            'payment_frequency' => PaymentFrequency::Monthly->value,
            'payment_day' => 5,
            'signed_at' => $status !== LeaseStatus::Draft ? $startDate->format('Y-m-d') : null,
            'created_at' => $startDate->format('Y-m-d H:i:s'),
            'updated_at' => now(),
        ], $extraAttributes)));

        $this->ctx->leases->push($lease);
    }

    /**
     * Crée un lease avec un loyer spécifique.
     */
    private function createLeaseWithRent(
        int $agencyId,
        Property $property,
        Customer $customer,
        int $rentAmount
    ): void {
        $this->createLeaseWithDates(
            $agencyId,
            $property,
            $customer,
            now()->subMonths(2),
            now()->addMonths(10),
            LeaseStatus::Active,
            ['monthly_rent' => $rentAmount, 'deposit_amount' => $rentAmount]
        );
    }

    /**
     * Crée un booking avec un statut spécifique.
     *
     * @param  array<string, mixed>  $extraAttributes
     */
    private function createBookingWithStatus(
        int $agencyId,
        Property $property,
        Customer $customer,
        ?int $agentId,
        BookingStatus $status,
        array $extraAttributes = []
    ): void {
        $createdAt = $extraAttributes['created_at'] ?? now()->subDays(7);

        Booking::withoutEvents(fn () => Booking::create(array_merge([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'created_by_id' => $agentId,
            'agency_id' => $agencyId,
            'reference_number' => 'BK-EC-'.strtoupper(Str::random(6)),
            'status' => $status->value,
            'total_amount' => $property->price,
            'deposit_amount' => (int) ($property->price * 0.2),
            'currency' => $property->currency?->value ?? 'XOF',
            'start_date' => now()->addWeek()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
            'expires_at' => $createdAt->copy()->addDays(7),
            'created_at' => $createdAt,
            'updated_at' => now(),
        ], $extraAttributes)));
    }

    /**
     * Crée un booking avec des montants spécifiques.
     */
    private function createBookingWithAmount(
        int $agencyId,
        Property $property,
        Customer $customer,
        ?int $agentId,
        int $totalAmount,
        int $depositAmount
    ): void {
        $this->createBookingWithStatus(
            $agencyId,
            $property,
            $customer,
            $agentId,
            BookingStatus::Confirmed,
            [
                'total_amount' => $totalAmount,
                'deposit_amount' => $depositAmount,
                'confirmed_at' => now()->subDays(2),
            ]
        );
    }

    /**
     * Crée une property avec des attributs spécifiques.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function createPropertyWithSpecifics(int $agencyId, int $ownerId, array $attributes): Property
    {
        $title = $attributes['title'] ?? 'Property Edge Case';

        return Property::withoutEvents(fn () => Property::create(array_merge([
            'user_id' => $ownerId,
            'agency_id' => $agencyId,
            'reference_number' => 'PR-EC-'.strtoupper(Str::random(6)),
            'title' => $title,
            'slug' => Str::slug($title).'-'.Str::random(4),
            'description' => 'Property créée pour tester les cas limites.',
            'type' => PropertyType::Apartment->value,
            'contract_type' => ContractType::Rent->value,
            'status' => PropertyStatus::Available->value,
            'visibility' => PropertyVisibility::Public->value,
            'price' => 500000,
            'currency' => 'XOF',
            'area' => 100,
            'bedrooms' => 2,
            'bathrooms' => 1,
            'featured' => false,
            'furnished' => false,
            'published_at' => now(),
            'created_at' => now()->subDays(30),
            'updated_at' => now(),
        ], $attributes)));
    }
}
