<?php

namespace Tests\Feature\Visits;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2578 (ADR-0101 § 6) — « À clore » : les visites confirmées dont l'heure est passée, et les
 * visites terminées sans compte rendu depuis au plus `visits.report_pending_days` jours.
 */
class PropertyVisitToCloseFilterTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_ac5_a_clore_rend_les_confirmees_passees_et_les_terminees_recentes_sans_compte_rendu(): void
    {
        Notification::fake();
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $bien = $this->bienDe($agence);

        $creer = fn (array $a) => PropertyVisit::factory()->create($a + [
            'property_id' => $bien->id,
            'agent_id' => $agent->id,
        ])->id;

        $confirmeePassee = $creer(['status' => VisitStatus::Confirmed, 'scheduled_at' => now()->subHours(2)]);
        $termineeHier = $creer(['status' => VisitStatus::Completed, 'scheduled_at' => now()->subDay(), 'completed_at' => now()->subDay()]);
        $termineeIlYADixJours = $creer(['status' => VisitStatus::Completed, 'scheduled_at' => now()->subDays(10), 'completed_at' => now()->subDays(10)]);
        $avecCompteRendu = $creer([
            'status' => VisitStatus::Completed, 'scheduled_at' => now()->subDay(), 'completed_at' => now()->subDay(),
            'report_outcome' => 'interested', 'reported_at' => now()->subHours(20),
        ]);
        $confirmeeAVenir = $creer(['status' => VisitStatus::Confirmed, 'scheduled_at' => now()->addHours(2)]);
        $planifieePassee = $creer(['status' => VisitStatus::Scheduled, 'scheduled_at' => now()->subHours(2)]);
        $annulee = $creer(['status' => VisitStatus::Cancelled, 'scheduled_at' => now()->subHours(2)]);

        Sanctum::actingAs($agent);
        $ids = collect($this->getJson('/api/property-visits?filter[to_close]=1&per_page=50')->assertOk()->json('data'))
            ->pluck('id')->all();

        $this->assertEqualsCanonicalizing([$confirmeePassee, $termineeHier], $ids);
        $this->assertNotContains($termineeIlYADixJours, $ids);
        $this->assertNotContains($avecCompteRendu, $ids);
        $this->assertNotContains($confirmeeAVenir, $ids);
        $this->assertNotContains($planifieePassee, $ids);
        $this->assertNotContains($annulee, $ids);

        // Le réglage borne la fenêtre : à 14 jours, la visite d'il y a dix jours revient.
        config(['visits.report_pending_days' => 14]);
        $ids = collect($this->getJson('/api/property-visits?filter[to_close]=1&per_page=50')->assertOk()->json('data'))
            ->pluck('id')->all();
        $this->assertContains($termineeIlYADixJours, $ids);

        // Sans le filtre (ou à 0), tout revient.
        $this->assertCount(7, $this->getJson('/api/property-visits?filter[to_close]=0&per_page=50')->json('data'));
    }
}
