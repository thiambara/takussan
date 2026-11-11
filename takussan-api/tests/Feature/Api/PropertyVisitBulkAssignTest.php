<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2585 — `POST /api/property-visits/bulk-assign` : réservé à `crm.assign`, l'agent désigné du
 * personnel de l'agence, chaque ligne jugée dans l'agence de son bien, sans atomicité.
 */
class PropertyVisitBulkAssignTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private Property $bien;

    private User $chef;

    private User $collegue;

    protected function setUp(): void
    {
        parent::setUp();

        $this->x = $this->agence();
        $this->bien = $this->bienDe($this->x);
        // Le rôle système de l'agent détient `crm.assign` (cf. PropertyVisitAssignmentTest).
        $this->chef = $this->personnel($this->x);
        $this->collegue = $this->personnel($this->x);
    }

    private function visite(array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $this->bien->id,
            'agent_id' => null,
            'status' => VisitStatus::Scheduled,
        ]);
    }

    /** 403 sans `crm.assign`, avant toute validation ; rien n'est écrit. */
    public function test_sans_crm_assign_403(): void
    {
        $visite = $this->visite();
        $role = AgencyRole::factory()->for($this->x)->withCapabilities([Capability::PropertiesCreate])->create();

        foreach ([$this->personnel($this->x, agencyRole: $role), User::query()->findOrFail($this->bien->user_id), $this->client()] as $user) {
            Sanctum::actingAs($user);
            $this->postJson('/api/property-visits/bulk-assign', ['ids' => [$visite->id], 'agent_id' => $this->collegue->id])->assertForbidden();
            $this->postJson('/api/property-visits/bulk-assign', [])->assertForbidden();
        }

        $this->assertNull($visite->fresh()->agent_id);
    }

    public function test_attribue_ligne_par_ligne_sans_atomicite(): void
    {
        $a = $this->visite();
        $b = $this->visite(['agent_id' => $this->chef->id, 'status' => VisitStatus::Confirmed]);
        $close = $this->visite(['status' => VisitStatus::Completed]);
        $etrangere = PropertyVisit::factory()->create(['property_id' => $this->bienDe($this->agence())->id, 'agent_id' => null]);

        Sanctum::actingAs($this->chef);
        $response = $this->postJson('/api/property-visits/bulk-assign', [
            'ids' => [$a->id, $close->id, $etrangere->id, 999999, $b->id],
            'agent_id' => $this->collegue->id,
        ])->assertOk();

        $this->assertSame([
            ['id' => $a->id, 'ok' => true],
            ['id' => $close->id, 'ok' => false, 'code' => 'visit.closed', 'status' => 422],
            ['id' => $etrangere->id, 'ok' => false, 'code' => 'visit.staff_only', 'status' => 403],
            ['id' => 999999, 'ok' => false, 'code' => 'visit.staff_only', 'status' => 403],
            ['id' => $b->id, 'ok' => true],
        ], $response->json('data'));
        $this->assertSame(['ok' => 2, 'failed' => 3], $response->json('meta'));

        $this->assertSame($this->collegue->id, $a->fresh()->agent_id);
        $this->assertSame($this->collegue->id, $b->fresh()->agent_id);
        $this->assertNull($close->fresh()->agent_id);
        $this->assertNull($etrangere->fresh()->agent_id);
    }

    /** L'agent désigné doit être du personnel de l'agence : un agent d'ailleurs, un bailleur → 422. */
    public function test_l_agent_designe_doit_etre_du_personnel(): void
    {
        $visite = $this->visite();
        Sanctum::actingAs($this->chef);

        foreach ([$this->personnel($this->agence()), $this->bailleur($this->x)] as $cible) {
            $this->postJson('/api/property-visits/bulk-assign', ['ids' => [$visite->id], 'agent_id' => $cible->id])
                ->assertStatus(422)->assertJsonValidationErrors('agent_id');
        }
        $this->postJson('/api/property-visits/bulk-assign', ['ids' => array_fill(0, 2, $visite->id), 'agent_id' => $this->collegue->id])
            ->assertStatus(422)->assertJsonValidationErrors('ids.0');

        $this->assertNull($visite->fresh()->agent_id);
    }
}
