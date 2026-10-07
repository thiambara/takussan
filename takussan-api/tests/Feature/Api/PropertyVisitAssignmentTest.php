<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590 — une visite non attribuée se voit, se prend en charge, et ne s'attribue qu'au
 * personnel de l'agence du bien (AC4, AC5, AC6).
 */
class PropertyVisitAssignmentTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private Property $bien;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->bien = $this->bienDe($this->x);
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'visitor_id' => $this->client()->id,
            'agent_id' => null,
            'status' => VisitStatus::Scheduled,
        ]);
    }

    /** @return list<int> */
    private function nonAttribueesVuesPar(User $user): array
    {
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/property-visits?filter[unassigned]=1')->assertOk()->json('data'))
            ->pluck('id')->all();
    }

    /** AC4 (R) — le collègue voit la visite non attribuée ; un agent de Y et un client de X non. */
    public function test_le_personnel_voit_les_visites_non_attribuees(): void
    {
        $agentB = $this->personnel($this->x);
        $this->assertSame([$this->visite->id], $this->nonAttribueesVuesPar($agentB));

        $this->assertSame([], $this->nonAttribueesVuesPar($this->personnel($this->agence())));

        $clientDeX = $this->client();
        $this->ficheClient($this->x, $clientDeX);
        $this->assertSame([], $this->nonAttribueesVuesPar($clientDeX));
    }

    /** AC4 — toute visite rendue par `index` passe `PropertyVisitPolicy::view`. */
    public function test_index_ne_rend_que_ce_que_view_autorise(): void
    {
        $autre = PropertyVisit::factory()->create(['property_id' => $this->bienDe($this->agence())->id]);
        $assignee = $this->personnel($this->x);
        $this->visite->update(['agent_id' => $assignee->id]);

        foreach ([$this->personnel($this->x), $this->personnel($this->agence()), $assignee, $autre->visitor] as $user) {
            Sanctum::actingAs($user);
            foreach ($this->getJson('/api/property-visits')->assertOk()->json('data') as $row) {
                $this->assertTrue($user->can('view', PropertyVisit::query()->findOrFail($row['id'])), "visite {$row['id']} hors de view pour {$user->id}");
            }
        }
    }

    /** AC5 — B prend en charge ; C sans `crm.assign` la reprend → 409 ; un agent de Y → 403. */
    public function test_prendre_en_charge(): void
    {
        $agentB = $this->personnel($this->x);
        Sanctum::actingAs($agentB);
        $this->postJson("/api/property-visits/{$this->visite->id}/claim")
            ->assertOk()->assertJsonPath('data.agent_id', $agentB->id);

        $role = AgencyRole::factory()->for($this->x)->withCapabilities([Capability::PropertiesCreate])->create();
        Sanctum::actingAs($this->personnel($this->x, agencyRole: $role));
        $this->postJson("/api/property-visits/{$this->visite->id}/claim")->assertStatus(409);

        Sanctum::actingAs($this->personnel($this->agence()));
        $this->postJson("/api/property-visits/{$this->visite->id}/claim")->assertForbidden();

        $this->assertSame($agentB->id, $this->visite->fresh()->agent_id);

        // Qui détient `crm.assign` (le rôle système de l'agent) peut reprendre.
        $chef = $this->personnel($this->x);
        Sanctum::actingAs($chef);
        $this->postJson("/api/property-visits/{$this->visite->id}/claim")
            ->assertOk()->assertJsonPath('data.agent_id', $chef->id);
    }

    /** AC6 (R) — `agent_id` hors du personnel de l'agence du bien → 422, en PATCH comme en POST. */
    public function test_l_agent_vise_doit_etre_du_personnel_de_l_agence(): void
    {
        $agentX = $this->personnel($this->x);
        $agentY = $this->personnel($this->agence());
        $bailleurX = $this->bailleur($this->x);

        Sanctum::actingAs($agentX);
        foreach ([$agentY, $bailleurX] as $cible) {
            $this->patchJson("/api/property-visits/{$this->visite->id}", ['agent_id' => $cible->id])
                ->assertUnprocessable()->assertJsonValidationErrors(['agent_id']);
            $this->postJson('/api/property-visits', [
                'property_id' => $this->bien->id,
                'agent_id' => $cible->id,
                'visitor_name' => 'Awa Diop',
                'visitor_phone' => '+221771234567',
                'scheduled_at' => $this->creneau(),
            ])->assertUnprocessable()->assertJsonValidationErrors(['agent_id']);
        }
        $this->assertNull($this->visite->fresh()->agent_id);

        Sanctum::actingAs($agentY);
        $this->postJson("/api/property-visits/{$this->visite->id}/confirm")->assertForbidden();
    }

    /** AC6 — le bailleur visé n'administre pas la visite. Le périmètre de `update` est TCK-587. */
    public function test_le_bailleur_vise_ne_confirme_pas(): void
    {
        if (! method_exists(MembershipCapabilityResolver::class, 'isStaffAt')) {
            $this->markTestIncomplete('TCK-587 : PropertyVisitPolicy::update lit encore user->agency_id.');
        }

        Sanctum::actingAs($this->bailleur($this->x));
        $this->postJson("/api/property-visits/{$this->visite->id}/confirm")->assertForbidden();
    }
}
