<?php

namespace Tests\Concerns;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\SystemRoleCapabilities;

/**
 * TCK-587 (ADR-0031) — des membres d'agence nommés par ce qu'ils SONT.
 *
 * `User::factory()->create(['agency_id' => X])` fabrique un bailleur (`OwnerProfile`), et plus de
 * cent cinquante fixtures l'appelaient `$agent`. Depuis que le bailleur n'a plus le périmètre de
 * l'agence, ce nom ment : ces aides le remplacent par un profil explicite.
 */
trait CreatesAgencyMembers
{
    protected function agencyAgent(Agency $agency): User
    {
        return User::factory()->withAgentProfile($agency)->create();
    }

    protected function agencyAdmin(Agency $agency): User
    {
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        return $admin;
    }

    /**
     * Un agent dont le rôle PERSONNALISÉ est le rôle système d'agent moins les capacités données :
     * c'est la forme qui prouve qu'une capacité est lue — avec le rôle système le geste passe, sans
     * elle il est refusé, et rien d'autre ne change.
     */
    protected function agentWithout(Agency $agency, Capability ...$removed): User
    {
        return $this->memberWithout(AgencyRoleBaseType::Agent, $agency, ...$removed);
    }

    protected function adminWithout(Agency $agency, Capability ...$removed): User
    {
        return $this->memberWithout(AgencyRoleBaseType::AgencyAdmin, $agency, ...$removed);
    }

    /** Un agent dont le rôle personnalisé est le rôle système d'agent PLUS les capacités données. */
    protected function agentWith(Agency $agency, Capability ...$added): User
    {
        return $this->memberWithRole(
            AgencyRoleBaseType::Agent,
            $agency,
            array_values(array_unique([...app(SystemRoleCapabilities::class)->for(AgencyRoleBaseType::Agent), ...$added], SORT_REGULAR)),
        );
    }

    private function memberWithout(AgencyRoleBaseType $type, Agency $agency, Capability ...$removed): User
    {
        return $this->memberWithRole($type, $agency, array_values(array_filter(
            app(SystemRoleCapabilities::class)->for($type),
            static fn (Capability $c): bool => ! in_array($c, $removed, true),
        )));
    }

    /** @param  array<int, Capability>  $capabilities */
    private function memberWithRole(AgencyRoleBaseType $type, Agency $agency, array $capabilities): User
    {
        $role = AgencyRole::factory()
            ->ofType($type)
            ->withCapabilities($capabilities)
            ->create(['agency_id' => $agency->id]);

        $user = User::factory()->create();
        $profileClass = $type === AgencyRoleBaseType::Agent ? AgentProfile::class : AgencyAdminProfile::class;
        $profileClass::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $role->id,
        ]);

        return $user;
    }
}
