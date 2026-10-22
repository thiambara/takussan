<?php

namespace Tests\Feature\Api;

use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1305 (P115.05) — rien n'écrivait `no_show` : l'agent dont le visiteur ne venait pas devait
 * déclarer la visite terminée (comptée parmi les visites menées, ouverte à l'avis) ou l'annuler.
 * `POST property-visits/{visit}/no-show` la marque absente, depuis `scheduled` ou `confirmed`,
 * une fois l'heure passée, par qui agit pour le bien.
 */
class PropertyVisitNoShowTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $visitor;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $this->visitor = User::factory()->create();
        $this->property = Property::factory()->create(['user_id' => $this->owner->id]);
    }

    private function visit(VisitStatus $status, string $when): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->property->id,
            'visitor_id' => $this->visitor->id,
            'status' => $status,
            'scheduled_at' => now()->modify($when),
        ]);
    }

    public function test_le_bailleur_marque_absente_une_visite_confirmee_dont_l_heure_est_passee(): void
    {
        $visit = $this->visit(VisitStatus::Confirmed, '-2 hours');
        Sanctum::actingAs($this->owner);

        $this->postJson("/api/property-visits/{$visit->id}/no-show")
            ->assertOk()
            ->assertJsonPath('data.status', 'no_show');

        $this->assertSame(VisitStatus::NoShow, $visit->fresh()->status);
        $this->assertNull($visit->fresh()->completed_at);
    }

    public function test_une_visite_planifiee_non_confirmee_se_marque_aussi(): void
    {
        $visit = $this->visit(VisitStatus::Scheduled, '-1 day');
        Sanctum::actingAs($this->owner);

        $this->postJson("/api/property-visits/{$visit->id}/no-show")
            ->assertOk()
            ->assertJsonPath('data.status', 'no_show');
    }

    public function test_une_visite_a_venir_ne_se_marque_pas_absente(): void
    {
        $visit = $this->visit(VisitStatus::Confirmed, '+2 hours');
        Sanctum::actingAs($this->owner);

        $this->postJson("/api/property-visits/{$visit->id}/no-show")
            ->assertStatus(422)
            ->assertJsonPath('code', 'visit.cannot_mark_no_show');
        $this->assertSame(VisitStatus::Confirmed, $visit->fresh()->status);
    }

    public function test_une_visite_terminee_ou_annulee_ne_se_marque_pas_absente(): void
    {
        Sanctum::actingAs($this->owner);

        foreach ([VisitStatus::Completed, VisitStatus::Cancelled, VisitStatus::NoShow] as $status) {
            $visit = $this->visit($status, '-2 hours');
            $this->postJson("/api/property-visits/{$visit->id}/no-show")
                ->assertStatus(422)
                ->assertJsonPath('code', 'visit.cannot_mark_no_show');
            $this->assertSame($status, $visit->fresh()->status);
        }
    }

    public function test_le_visiteur_ne_se_marque_pas_absent(): void
    {
        $visit = $this->visit(VisitStatus::Confirmed, '-2 hours');
        Sanctum::actingAs($this->visitor);

        $this->postJson("/api/property-visits/{$visit->id}/no-show")->assertForbidden();
        $this->assertSame(VisitStatus::Confirmed, $visit->fresh()->status);
    }
}
