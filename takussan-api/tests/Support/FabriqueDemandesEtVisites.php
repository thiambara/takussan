<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;

/**
 * TCK-590 — les acteurs des tests de demandes et de visites : agences, personnel, bailleurs,
 * clients, biens d'agence et collaborateurs, et les créneaux de la grille à l'heure de Dakar.
 *
 * Un trait et non une classe de base : `scripts/check-test-base-classes.mjs` n'en admet que trois.
 */
trait FabriqueDemandesEtVisites
{
    protected function agence(): Agency
    {
        return Agency::factory()->create();
    }

    /** Un agent (ou un admin) ACTIF de l'agence, joignable par SMS. */
    protected function personnel(Agency $agency, string $role = 'agent', ?AgencyRole $agencyRole = null, array $attributes = []): User
    {
        $user = User::factory()->create($attributes + [
            'phone' => '+22177'.random_int(1000000, 9999999),
            'status' => UserStatus::Active,
        ]);

        $profile = ['user_id' => $user->id, 'agency_id' => $agency->id];
        if ($agencyRole !== null) {
            $profile['agency_role_id'] = $agencyRole->id;
        }

        $role === 'agency_admin'
            ? AgencyAdminProfile::factory()->create($profile)
            : AgentProfile::factory()->create($profile);

        return $user->fresh();
    }

    protected function bailleur(Agency $agency, array $attributes = []): User
    {
        $user = User::factory()->create($attributes);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user->fresh();
    }

    /** Un compte sans aucun profil : un client du site public. */
    protected function client(array $attributes = []): User
    {
        return User::factory()->create($attributes);
    }

    protected function ficheClient(Agency $agency, ?User $user = null, array $attributes = []): Customer
    {
        return Customer::factory()->create($attributes + [
            'agency_id' => $agency->id,
            'user_id' => $user?->id,
        ]);
    }

    protected function bienDe(?Agency $agency, ?User $owner = null, bool $public = true): Property
    {
        $factory = Property::factory();
        if ($public) {
            $factory = $factory->published();
        }

        // Vérification adverse — `contract_type` et `rent_period` étaient tirés au hasard : sans
        // effet mesuré aujourd'hui, mais un vert qui dépend d'un tirage n'en est pas un.
        return $factory->create([
            'contract_type' => ContractType::Rent->value,
            'rent_period' => RentPeriod::Monthly->value,
            'agency_id' => $agency?->id,
            'user_id' => ($owner ?? User::factory()->create())->id,
            'visibility' => $public ? 'public' : 'private',
        ]);
    }

    protected function collaborateur(Property $property, User $user, string $inviteLe = '2026-01-10 09:00:00'): PropertyCollaborator
    {
        return PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $user->id,
            'role' => CollaboratorRole::Agent->value,
            'invited_at' => $inviteLe,
        ]);
    }

    /** Un départ de la grille, à Dakar, dans `$jours` jours — rendu en UTC ISO-8601. */
    protected function creneau(int $jours = 2, int $heure = 10, int $minute = 0): string
    {
        return CarbonImmutable::now(VisitSchedulingService::TIMEZONE)
            ->addDays($jours)
            ->setTime($heure, $minute)
            ->utc()
            ->toIso8601String();
    }
}
