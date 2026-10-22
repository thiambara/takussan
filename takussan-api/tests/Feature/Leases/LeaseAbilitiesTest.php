<?php

namespace Tests\Feature\Leases;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Membership\AgencyRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P152.02 — le détail d'un bail dit, par `abilities`, ce que le lecteur peut y faire parmi les quatre
 * gestes que `LeasePolicy` juge par capacité : renouveler, réviser le loyer, encaisser, restituer le
 * dépôt. La fiche montait ces gestes à tout rôle de gestion, et l'API les refusait (403).
 */
class LeaseAbilitiesTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @param  list<Capability>  $capabilities */
    private function customRole(Agency $agency, array $capabilities): AgencyRole
    {
        $roles = app(AgencyRoleService::class);
        $role = $roles->create($agency, ['name' => 'Rôle '.uniqid(), 'base_profile_type' => AgencyRoleBaseType::Agent->value]);

        return $roles->replaceCapabilities($role, $capabilities);
    }

    /**
     * @param  list<Capability>  $capabilities
     * @return array<string, bool>
     */
    private function abilitiesOfAgent(array $capabilities): array
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->active()->create(['agency_id' => $agency->id]);
        $user = User::factory()->create();
        $profile = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'agency_role_id' => $this->customRole($agency, $capabilities)->id,
        ]);

        $this->actingAs($user, 'sanctum');

        return $this->apiGet("/api/leases/{$lease->id}", ['X-Profile-Id' => "agent:{$profile->id}"])
            ->assertOk()
            ->json('data.abilities');
    }

    public function test_un_agent_sans_les_capacites_ne_se_voit_offrir_aucun_des_quatre_gestes(): void
    {
        $this->assertSame([
            'renew' => false,
            'review_rent' => false,
            'record_payment' => false,
            'refund_deposit' => false,
        ], $this->abilitiesOfAgent([Capability::CrmViewAll]));
    }

    public function test_chaque_geste_suit_sa_capacite(): void
    {
        $this->assertSame([
            'renew' => true,
            'review_rent' => false,
            'record_payment' => true,
            'refund_deposit' => false,
        ], $this->abilitiesOfAgent([Capability::LeasesRenew, Capability::PaymentsRecord]));
    }

    public function test_le_bailleur_du_bail_garde_ses_quatre_gestes(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create(['landlord_id' => $landlord->id]);

        $this->actingAs($landlord, 'sanctum');

        $this->apiGet("/api/leases/{$lease->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities', [
                'renew' => true,
                'review_rent' => true,
                'record_payment' => true,
                'refund_deposit' => true,
            ]);
    }
}
