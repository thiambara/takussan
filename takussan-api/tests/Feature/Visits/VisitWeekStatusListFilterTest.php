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
 * TCK-2882 — la vue « Semaine » des visites (front) lit la semaine en UNE requête, sans les annulées :
 * `filter[status]=scheduled,confirmed,completed,no_show` (liste à virgules du filtre exact), bornée
 * par `scheduled_at_min` / `scheduled_at_max`. Ce test tient ce contrat côté API.
 */
class VisitWeekStatusListFilterTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_la_semaine_lit_une_liste_de_statuts_dans_ses_bornes(): void
    {
        Notification::fake();
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $bien = $this->bienDe($agence);
        $lundi = now()->startOfWeek();

        $creer = fn (VisitStatus $statut, $quand) => PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'agent_id' => $agent->id,
            'status' => $statut,
            'scheduled_at' => $quand,
        ])->id;

        $demandee = $creer(VisitStatus::Scheduled, $lundi->copy()->addDays(1)->setTime(10, 0));
        $confirmee = $creer(VisitStatus::Confirmed, $lundi->copy()->addDays(2)->setTime(11, 0));
        $terminee = $creer(VisitStatus::Completed, $lundi->copy()->setTime(9, 0));
        $absent = $creer(VisitStatus::NoShow, $lundi->copy()->addDays(3)->setTime(15, 0));
        $annulee = $creer(VisitStatus::Cancelled, $lundi->copy()->addDays(2)->setTime(16, 0));
        $semaineSuivante = $creer(VisitStatus::Confirmed, $lundi->copy()->addDays(8)->setTime(10, 0));

        Sanctum::actingAs($agent);
        $min = $lundi->copy()->utc()->format('Y-m-d\TH:i:s\Z');
        $max = $lundi->copy()->addDays(7)->subSecond()->utc()->format('Y-m-d\TH:i:s\Z');
        $ids = collect($this->getJson("/api/property-visits?filter[status]=scheduled,confirmed,completed,no_show&filter[scheduled_at_min]={$min}&filter[scheduled_at_max]={$max}&per_page=100")
            ->assertOk()->json('data'))->pluck('id')->all();

        $this->assertEqualsCanonicalizing([$demandee, $confirmee, $terminee, $absent], $ids);
        $this->assertNotContains($annulee, $ids);
        $this->assertNotContains($semaineSuivante, $ids);
    }
}
