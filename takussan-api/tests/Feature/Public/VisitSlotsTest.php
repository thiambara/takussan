<?php

namespace Tests\Feature\Public;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-590 AC11 — les créneaux d'une journée, à Dakar : un créneau occupé par une visite confirmée
 * est indisponible, le suivant non ; rien n'est dit de la visite qui l'occupe.
 */
class VisitSlotsTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_un_creneau_occupe_est_indisponible_et_le_suivant_libre(): void
    {
        $x = $this->agence();
        $bien = $this->bienDe($x);
        $jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(2);

        PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'scheduled_at' => $jour->setTime(10, 0)->utc(),
            'duration_minutes' => 30,
            'status' => VisitStatus::Confirmed,
        ]);

        $response = $this->getJson("/api/public/properties/{$bien->slug}/visit-slots?date=".$jour->format('Y-m-d'))
            ->assertOk()
            ->assertJsonPath('data.timezone', 'Africa/Dakar')
            ->assertJsonPath('data.date', $jour->format('Y-m-d'));

        $slots = collect($response->json('data.slots'))->keyBy('label');
        $this->assertSame('09:00', $slots->keys()->first());
        $this->assertSame('18:30', $slots->keys()->last());
        $this->assertCount(20, $slots);

        $this->assertFalse($slots['10:00']['available']);
        $this->assertTrue($slots['10:30']['available']);
        $this->assertTrue($slots['09:30']['available']);
        $this->assertSame($jour->setTime(10, 0)->utc()->format('Y-m-d\TH:i:s\Z'), $slots['10:00']['start']);

        foreach ($slots as $slot) {
            $this->assertSame(['available', 'label', 'start'], collect($slot)->keys()->sort()->values()->all());
        }
    }

    public function test_une_date_passee_ou_mal_formee_est_refusee(): void
    {
        $bien = $this->bienDe($this->agence());

        $this->getJson("/api/public/properties/{$bien->slug}/visit-slots?date=".now()->subDay()->format('Y-m-d'))
            ->assertUnprocessable();
        $this->getJson("/api/public/properties/{$bien->slug}/visit-slots?date=12/11/2026")
            ->assertUnprocessable();
    }
}
