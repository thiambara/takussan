<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Tests\ApiTestCase;

/**
 * P208.01, P208.03, P208.04, P208.05, P208.06 (TCK-2190) — la création générique
 * `POST /api/invitations` est retirée (décision du porteur du 2026-10-24).
 *
 * Elle laissait un admin d'agence rattacher l'invité au brouillon d'une autre agence
 * (`invitable_id` jugé ni en existence ni en agence), émettre une cooptation `super_admin`
 * hors de `SuperAdminCooptationService`, et inviter depuis une agence `individual`. Les
 * routes par rôle (`agencies/{agency}/owners|agents|service-providers/invite`) et la
 * cooptation (`admin/super-admins/invite`) sont les seules portes ; la liste, la lecture,
 * la révocation, la relance et l'acceptation restent.
 */
class CreationGeneriqueRetireeTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_la_route_de_creation_generique_n_existe_plus(): void
    {
        $this->assertFalse(Route::has('invitations.store'));

        foreach (['invitations.index', 'invitations.show', 'invitations.revoke', 'invitations.resend', 'invitations.accept'] as $nom) {
            $this->assertTrue(Route::has($nom), "{$nom} doit rester");
        }
    }

    public function test_l_admin_d_une_agence_ne_rattache_plus_le_brouillon_d_une_autre_agence(): void
    {
        Mail::fake();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency_id' => $a->id]);

        $brouillon = AgentProfile::factory()->create([
            'agency_id' => $b->id,
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->postJson('/api/invitations', [
            'email' => 'intrus@example.com',
            'role' => 'agent',
            'invitable_type' => AgentProfile::class,
            'invitable_id' => $brouillon->id,
        ])->assertStatus(405);

        $this->assertDatabaseMissing('invitations', ['email' => 'intrus@example.com']);
        $this->assertSame(AgentProfileStatus::Draft, $brouillon->fresh()->status);
        $this->assertNull($brouillon->fresh()->user_id);
    }

    public function test_l_admin_d_une_agence_n_emet_plus_de_cooptation_super_admin(): void
    {
        Mail::fake();
        $this->apiActingAsRole('agency_admin');
        $compte = User::factory()->withTwoFactor()->create(['email' => 'operateur@example.com']);

        $this->postJson('/api/invitations', [
            'email' => $compte->email,
            'role' => 'super_admin',
        ])->assertStatus(405);

        $this->assertSame(0, Invitation::query()->where('role', 'super_admin')->count());
    }

    public function test_le_super_admin_ne_coopte_plus_par_le_generique(): void
    {
        Mail::fake();
        $this->apiActingAsRole('super_admin');

        $this->postJson('/api/invitations', [
            'email' => 'neuf@example.com',
            'role' => 'super_admin',
        ])->assertStatus(405);

        $this->assertDatabaseMissing('invitations', ['email' => 'neuf@example.com']);
    }

    public function test_une_agence_individuelle_n_invite_plus_par_le_generique(): void
    {
        Mail::fake();
        $agence = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->apiActingAsRole('agency_admin', ['agency_id' => $agence->id]);
        $brouillon = OwnerProfile::factory()->create(['agency_id' => $agence->id]);

        $this->postJson('/api/invitations', [
            'email' => 'bailleur@example.com',
            'role' => 'owner',
            'invitable_type' => OwnerProfile::class,
            'invitable_id' => $brouillon->id,
        ])->assertStatus(405);

        $this->assertDatabaseMissing('invitations', ['email' => 'bailleur@example.com']);
    }

    public function test_la_liste_reste_ouverte(): void
    {
        $this->apiActingAsRole('agency_admin');

        $this->getJson('/api/invitations')->assertOk();
    }
}
