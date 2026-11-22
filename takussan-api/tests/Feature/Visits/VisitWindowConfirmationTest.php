<?php

namespace Tests\Feature\Visits;

use App\Jobs\SendPropertyVisitReminders;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2502 — l'agent fixe l'heure d'une visite demandée par tranche EN LA CONFIRMANT : `scheduled_at`
 * prend l'heure, `preferred_window` retombe à `null`. Sans heure, la confirmation est refusée.
 */
class VisitWindowConfirmationTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: PropertyVisit, 2: CarbonImmutable} */
    private function visiteATranche(): array
    {
        Notification::fake();
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->startOfDay();

        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => VisitWindow::Afternoon->startOn($jour->format('Y-m-d'))->utc(),
            'preferred_window' => VisitWindow::Afternoon,
            'duration_minutes' => 30,
        ]);

        return [$owner, $visit, $jour];
    }

    /** AC3 — l'agent confirme à 15:30 : l'heure est fixée, la tranche tombe. */
    public function test_confirmer_a_15h30_fixe_l_heure_et_leve_la_tranche(): void
    {
        [$owner, $visit, $jour] = $this->visiteATranche();
        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm", [
            'scheduled_at' => $jour->setTime(15, 30)->utc()->toIso8601String(),
        ])->assertOk()
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.preferred_window', null);

        $fresh = $visit->fresh();
        $this->assertSame(VisitStatus::Confirmed, $fresh->status);
        $this->assertNull($fresh->preferred_window);
        $this->assertSame(
            $jour->format('Y-m-d').' 15:30',
            CarbonImmutable::instance($fresh->scheduled_at)->setTimezone(VisitSchedulingService::TIMEZONE)->format('Y-m-d H:i'),
        );
    }

    /** Sans heure, une visite à tranche ne se confirme pas : le début de tranche n'est pas un rendez-vous. */
    public function test_confirmer_une_tranche_sans_heure_est_refuse(): void
    {
        [$owner, $visit] = $this->visiteATranche();
        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm")
            ->assertUnprocessable()
            ->assertJsonPath('code', 'visit.time_required');

        $this->assertSame(VisitStatus::Scheduled, $visit->fresh()->status);
        $this->assertSame(VisitWindow::Afternoon, $visit->fresh()->preferred_window);
    }

    /** Une visite à heure précise se confirme toujours sans corps, comme avant. */
    public function test_une_visite_a_heure_precise_se_confirme_sans_corps(): void
    {
        [$owner, $visit] = $this->visiteATranche();
        $visit->forceFill(['preferred_window' => null])->save();
        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm")->assertOk()->assertJsonPath('data.status', 'confirmed');
    }

    /** Déplacer l'heure (agence) fixe aussi l'heure : la tranche tombe, la visite reste à confirmer. */
    public function test_deplacer_l_heure_leve_la_tranche(): void
    {
        [$owner, $visit, $jour] = $this->visiteATranche();
        Sanctum::actingAs($owner);

        $this->patchJson("/api/property-visits/{$visit->id}", [
            'scheduled_at' => $jour->setTime(16, 0)->utc()->toIso8601String(),
        ])->assertOk()->assertJsonPath('data.preferred_window', null);

        $this->assertNull($visit->fresh()->preferred_window);
        $this->assertSame(VisitStatus::Scheduled, $visit->fresh()->status);
    }

    /** Confirmée à 15:30, la visite reçoit son rappel « 1 h avant » à 14:30 — l'heure fixée, pas la tranche. */
    public function test_la_visite_confirmee_est_rappelee_pour_l_heure_fixee(): void
    {
        [$owner, $visit, $jour] = $this->visiteATranche();
        Sanctum::actingAs($owner);
        $this->postJson("/api/property-visits/{$visit->id}/confirm", [
            'scheduled_at' => $jour->setTime(15, 30)->utc()->toIso8601String(),
        ])->assertOk();

        $this->travelTo($jour->setTime(13, 0));
        (new SendPropertyVisitReminders)->handle();
        $this->assertEmpty($visit->fresh()->metadata['reminder_1h_sent_at'] ?? null, 'pas de rappel au début de tranche');

        $this->travelTo($jour->setTime(14, 30));
        (new SendPropertyVisitReminders)->handle();
        $this->assertNotEmpty($visit->fresh()->metadata['reminder_1h_sent_at'] ?? null);
    }

    /** Revue — l'heure qui fixe la tranche ne peut pas être passée : 422, rien ne change. */
    public function test_confirmer_une_tranche_a_une_heure_passee_est_refuse(): void
    {
        [$owner, $visit] = $this->visiteATranche();
        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm", [
            'scheduled_at' => now()->subHour()->toIso8601String(),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);

        $fresh = $visit->fresh();
        $this->assertSame(VisitStatus::Scheduled, $fresh->status);
        $this->assertSame(VisitWindow::Afternoon, $fresh->preferred_window);
    }
}
