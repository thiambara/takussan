<?php

namespace Tests\Feature\Authorization;

use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2020 (P190.07, décision du porteur : ADR-0031 § 3, aucun périmètre pour un profil non
 * actif) — TCK-1705 ne tenait `user_id` pour titre sur un bien d'agence que si l'auteur y avait un
 * profil « de tout statut » : l'agent suspendu lisait encore le bien qu'il avait saisi et le gardait
 * dans sa liste. Désormais : bailleur du bien (`BailleurDuBien`, de tout statut) ou personnel actif
 * de l'agence.
 */
class AgentCreateurSuspenduLectureDuBienTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function bienDe(User $auteur): Property
    {
        $this->property->forceFill(['user_id' => $auteur->id])->save();

        return $this->property;
    }

    /** @return list<int> */
    private function listeDe(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/properties?per_page=100')->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_l_agent_createur_suspendu_ne_lit_plus_ni_ne_liste_le_bien(): void
    {
        $property = $this->bienDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $agent = $this->agent->fresh();
        $this->assertFalse($agent->can('view', $property));
        $this->assertFalse($agent->can('update', $property));
        Sanctum::actingAs($agent);
        $this->getJson("/api/properties/{$property->id}")->assertForbidden();
        $this->assertNotContains($property->id, $this->listeDe($agent));
    }

    /** Témoin de TCK-1705 : retiré, même refus. */
    public function test_l_agent_createur_retire_ne_lit_plus_ni_ne_liste_le_bien(): void
    {
        $property = $this->bienDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        Sanctum::actingAs($this->agent->fresh());
        $this->getJson("/api/properties/{$property->id}")->assertForbidden();
        $this->assertNotContains($property->id, $this->listeDe($this->agent));
    }

    /** Témoin : le bailleur auteur, bloqué, garde la lecture et sa liste (ADR-0031 § 2). */
    public function test_le_bailleur_auteur_bloque_lit_et_liste(): void
    {
        $property = $this->bienDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        Sanctum::actingAs($this->landlord->fresh());
        $this->getJson("/api/properties/{$property->id}")->assertOk();
        $this->assertContains($property->id, $this->listeDe($this->landlord));
    }

    /** Témoin : l'agent créateur actif lit, modifie et liste. */
    public function test_l_agent_createur_actif_lit_modifie_et_liste(): void
    {
        $property = $this->bienDe($this->agent);

        $this->assertTrue($this->agent->can('view', $property));
        $this->assertTrue($this->agent->can('update', $property));
        Sanctum::actingAs($this->agent);
        $this->getJson("/api/properties/{$property->id}")->assertOk();
        $this->assertContains($property->id, $this->listeDe($this->agent));
    }

    /** Témoin : le bailleur actif lit et liste son bien. */
    public function test_le_bailleur_actif_lit_et_liste(): void
    {
        $property = $this->bienDe($this->landlord);

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/properties/{$property->id}")->assertOk();
        $this->assertContains($property->id, $this->listeDe($this->landlord));
    }
}
