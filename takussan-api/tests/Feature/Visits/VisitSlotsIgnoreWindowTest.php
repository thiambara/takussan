<?php

namespace Tests\Feature\Visits;

use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\PropertyVisit;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-2502 — une visite à tranche n'occupe aucun créneau tant que son heure n'est pas fixée : ni
 * dans `visit-slots`, ni dans le garde de chevauchement d'une confirmation.
 *
 * Par l'API, elle reste `scheduled` (les deux ne comptent que les visites `confirmed`) ; l'état
 * `confirmed` + tranche est posé en base pour éprouver le filtre lui-même.
 */
class VisitSlotsIgnoreWindowTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private function visiteATranche(int $propertyId, CarbonImmutable $jour, VisitStatus $status): PropertyVisit
    {
        $visit = PropertyVisit::factory()->create([
            'property_id' => $propertyId,
            'scheduled_at' => VisitWindow::Afternoon->startOn($jour->format('Y-m-d'))->utc(),
            'duration_minutes' => 30,
            'status' => $status,
        ]);
        DB::table('property_visits')->where('id', $visit->id)->update(['preferred_window' => VisitWindow::Afternoon->value]);

        return $visit;
    }

    public function test_une_tranche_ne_bloque_pas_le_creneau_de_son_debut(): void
    {
        $bien = $this->bienDe($this->agence());
        $jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2)->startOfDay();
        $this->visiteATranche($bien->id, $jour, VisitStatus::Scheduled);
        $this->visiteATranche($bien->id, $jour, VisitStatus::Confirmed);

        $slots = collect($this->getJson("/api/public/properties/{$bien->slug}/visit-slots?date=".$jour->format('Y-m-d'))
            ->assertOk()->json('data.slots'))->keyBy('label');
        $this->assertTrue($slots['14:00']['available']);

        // Témoin : une visite CONFIRMÉE à 14:00 précis bloque le créneau.
        PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'scheduled_at' => $jour->setTime(14, 0)->utc(),
            'duration_minutes' => 30,
            'status' => VisitStatus::Confirmed,
        ]);
        $slots = collect($this->getJson("/api/public/properties/{$bien->slug}/visit-slots?date=".$jour->format('Y-m-d'))
            ->assertOk()->json('data.slots'))->keyBy('label');
        $this->assertFalse($slots['14:00']['available']);
    }

    public function test_une_tranche_ne_fait_pas_chevaucher_une_confirmation(): void
    {
        Notification::fake();
        $owner = $this->client();
        $bien = $this->bienDe(null, $owner);
        $jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2)->startOfDay();
        $this->visiteATranche($bien->id, $jour, VisitStatus::Confirmed);

        $precise = PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'scheduled_at' => $jour->setTime(14, 0)->utc(),
            'duration_minutes' => 30,
            'status' => VisitStatus::Scheduled,
        ]);

        Sanctum::actingAs($owner);
        $this->postJson("/api/property-visits/{$precise->id}/confirm")->assertOk();
    }
}
