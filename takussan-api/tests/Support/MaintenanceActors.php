<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;

/**
 * TCK-592 — les acteurs d'une intervention, construits comme la production les construit.
 *
 * Un prestataire n'est plus « un compte quelconque dans `assigned_to` » : il porte un
 * `ServiceProviderProfile` ACTIF et une collaboration ACTIVE avec l'agence du bien. Les tests qui
 * assignaient un `User::factory()` nu mesuraient un état que l'API refuse désormais (AC3).
 */
trait MaintenanceActors
{
    protected function providerFor(
        Agency $agency,
        CollaborationStatus $collaboration = CollaborationStatus::Active,
        ServiceProviderProfileStatus $profile = ServiceProviderProfileStatus::Active,
        array $userAttributes = [],
    ): User {
        $user = User::factory()->create($userAttributes);
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'status' => $profile->value,
            'specialties' => ['plumbing'],
            'service_areas' => ['Dakar'],
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $sp->id,
            'agency_id' => $agency->id,
            'status' => $collaboration->value,
            'started_at' => now()->subMonth()->toDateString(),
        ]);

        return $user;
    }

    protected function agentOf(Agency $agency, array $userAttributes = []): User
    {
        $user = User::factory()->create($userAttributes);
        AgentProfile::query()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user;
    }

    protected function landlordOf(Agency $agency, array $userAttributes = []): User
    {
        $user = User::factory()->create($userAttributes);
        OwnerProfile::query()->firstOrCreate(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user;
    }

    protected function tenantOf(Property $property, array $userAttributes = []): User
    {
        $user = User::factory()->create($userAttributes);
        Lease::factory()->create([
            'property_id' => $property->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $user->id])->id,
            'landlord_id' => $property->user_id,
            'status' => LeaseStatus::Active,
        ]);

        return $user;
    }

    /**
     * TCK-592 (P12) — un corps de devis valide : une ligne de main-d'œuvre au prix donné, valable
     * une semaine. `amount` et `currency` ne s'envoient plus (422).
     *
     * @return array<string, mixed>
     */
    protected function quoteBody(int|string $amount = 25000, array $extra = []): array
    {
        return array_merge([
            'lines' => [['label' => 'Main-d\'œuvre', 'kind' => 'labour', 'quantity' => 1, 'unit_price' => $amount]],
            'valid_until' => now()->addWeek()->toDateString(),
        ], $extra);
    }

    /**
     * Un bien d'agence, son bailleur, son locataire demandeur, un prestataire assigné.
     *
     * @return array{agency: Agency, property: Property, landlord: User, tenant: User, provider: User, mr: MaintenanceRequest}
     */
    protected function maintenanceScenario(MaintenanceStatus $status = MaintenanceStatus::Open, array $attributes = []): array
    {
        $agency = Agency::factory()->create();
        $landlord = $this->landlordOf($agency);
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);
        $tenant = $this->tenantOf($property);
        $provider = $this->providerFor($agency);

        $mr = MaintenanceRequest::factory()->create(array_merge([
            'property_id' => $property->id,
            'requester_id' => $tenant->id,
            'assigned_to' => $provider->id,
            'status' => $status,
        ], $attributes));

        return compact('agency', 'property', 'landlord', 'tenant', 'provider', 'mr');
    }
}
