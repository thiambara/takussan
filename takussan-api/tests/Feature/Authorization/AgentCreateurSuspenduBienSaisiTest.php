<?php

namespace Tests\Feature\Authorization;

use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2031 (P190.07, décision du porteur) — TCK-1705 tenait `user_id` pour titre sur un bien d'agence
 * pour qui y avait un profil « de tout statut » (`isMemberOf`) : l'agent suspendu lisait encore le
 * bien qu'il avait saisi et le gardait dans sa liste. ADR-0031 § 3 : un profil non actif ne confère
 * aucun périmètre ; seul le BAILLEUR suspendu garde la lecture (§ 2). `view`, `update` et la clause de
 * la liste passent par `BailleurDuBien::est` ou le personnel actif de l'agence.
 */
class AgentCreateurSuspenduBienSaisiTest extends TestCase
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

    private function bienSaisiPar(User $auteur): Property
    {
        $this->property->forceFill(['user_id' => $auteur->id, 'title' => 'Saisi'])->save();

        return $this->property;
    }

    /** @return list<int> */
    private function listeDe(User $user): array
    {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/properties')->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_l_agent_createur_suspendu_ne_lit_ni_ne_liste_le_bien(): void
    {
        $bien = $this->bienSaisiPar($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);
        $agent = $this->agent->fresh();

        $this->assertFalse($agent->can('view', $bien));
        $this->assertFalse($agent->can('update', $bien));
        Sanctum::actingAs($agent);
        $this->getJson("/api/properties/{$bien->id}")->assertForbidden();
        $this->putJson("/api/properties/{$bien->id}", ['title' => 'Repris'])->assertForbidden();
        $this->assertSame('Saisi', $bien->fresh()->title);
        $this->assertNotContains($bien->id, $this->listeDe($agent));
    }

    /** Témoin : le bailleur auteur, bloqué, garde la lecture et la liste (ADR-0031 § 2). */
    public function test_le_bailleur_auteur_bloque_lit_et_liste_le_bien(): void
    {
        $bien = $this->bienSaisiPar($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);
        $landlord = $this->landlord->fresh();

        Sanctum::actingAs($landlord);
        $this->getJson("/api/properties/{$bien->id}")->assertOk();
        $this->assertContains($bien->id, $this->listeDe($landlord));
    }

    /** Témoin : l'agent actif lit et liste le bien qu'il a saisi. */
    public function test_l_agent_createur_actif_lit_et_liste_le_bien(): void
    {
        $bien = $this->bienSaisiPar($this->agent);

        Sanctum::actingAs($this->agent);
        $this->getJson("/api/properties/{$bien->id}")->assertOk();
        $this->assertContains($bien->id, $this->listeDe($this->agent));
    }
}
