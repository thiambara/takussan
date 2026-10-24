<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2002 (P176.02, P176.03 ; ADR-0005, amendement du 2026-10-23) — le `roles` de
 * `/api/auth/me` ne compte que les profils ACTIFS tenus dans l'agence du profil actif, plus les
 * types globaux (`service_provider` actif, `tenant`), `customer` et `super_admin`.
 *
 * Avant : `profileTypes()` empilait les profils de toutes les agences du compte, quel que soit leur
 * statut. Un agent de A, admin de B, sous profil actif dans A, recevait `agency_admin` ; un admin
 * suspendu le recevait aussi, et le front leur ouvrait la section d'agence que l'API refuse ensuite.
 */
class AuthMeRolesAgenceActiveTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_agent_de_a_admin_de_b_sous_profil_actif_dans_a_n_est_pas_admin(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $user = User::factory()->create();
        $agentA = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->withHeaders(['X-Profile-Id' => "agent:{$agentA->id}"])
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $a->id)
            ->assertJsonPath('roles', ['agent', 'customer']);
    }

    public function test_le_meme_compte_sous_profil_actif_dans_b_y_est_admin_et_bailleur(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $adminB = AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->withHeaders(['X-Profile-Id' => "agency_admin:{$adminB->id}"])
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $b->id)
            ->assertJsonPath('roles', ['agency_admin', 'owner', 'customer']);
    }

    public function test_un_admin_suspendu_n_a_plus_le_role(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', null)
            ->assertJsonPath('roles', ['customer']);
    }

    public function test_un_agent_inactif_et_un_admin_archive_n_ont_plus_le_role(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        AgentProfile::factory()->inactive()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        AgencyAdminProfile::factory()->archived()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('roles', ['customer']);
    }

    public function test_un_profil_suspendu_dans_l_agence_active_n_y_compte_pas(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->withHeaders(['X-Profile-Id' => "agent:{$agent->id}"])
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('roles', ['agent', 'customer']);
    }

    public function test_sans_profil_actif_resolu_seuls_les_types_globaux_sortent(): void
    {
        // Deux agences, ni indice ni cookie : aucun profil actif résolu, `agency_id` nul.
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $user = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);
        ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        $client = Customer::factory()->create(['user_id' => $user->id]);
        Lease::factory()->create(['tenant_id' => $client->id, 'status' => LeaseStatus::Active]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', null)
            ->assertJsonPath('roles', ['service_provider', 'customer', 'tenant']);
    }

    public function test_un_prestataire_suspendu_n_a_plus_le_role(): void
    {
        $user = User::factory()->create();
        ServiceProviderProfile::factory()->create([
            'user_id' => $user->id,
            'status' => ServiceProviderProfileStatus::Suspended->value,
        ]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('roles', ['customer']);
    }

    public function test_le_compte_d_une_seule_agence_garde_son_role_par_l_auto_bascule(): void
    {
        // Hypothèse du ticket : l'agence « du profil actif » est celle que rend `agency_id`, auto-bascule
        // comprise — le même champ, dans la même réponse.
        $agency = Agency::factory()->create();
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->withToken($user->createToken('t')->plainTextToken)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('agency_id', $agency->id)
            ->assertJsonPath('roles', ['agency_admin', 'customer']);
    }
}
