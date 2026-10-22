<?php

namespace Tests\Feature\Visits;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendPropertyVisitReminders;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1527 (P169.01) — les marques `reminder_24h_sent_at` et `reminder_1h_sent_at` d'une visite
 * valent pour l'heure qu'elles ont rappelée. Une visite dont `scheduled_at` change reçoit les deux
 * rappels de son nouveau créneau (`docs/features.md`, « rappels automatiques avant visite, 24 h
 * et 1 h avant »), par les deux chemins qui déplacent l'heure : le report du visiteur
 * (`POST …/reschedule`, puis confirmation) et le déplacement par l'agence (`PATCH`).
 */
class RappelsDeVisiteApresReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_par_le_visiteur_puis_confirmation_rend_les_deux_rappels_du_nouveau_creneau(): void
    {
        [$owner, $visitor, $visit] = $this->visiteRappeleeDeuxFois();

        Sanctum::actingAs($visitor);
        $this->postJson("/api/property-visits/{$visit->id}/reschedule", [
            'scheduled_at' => $this->nouveauCreneau()->toIso8601String(),
        ])->assertOk();

        Sanctum::actingAs($owner);
        $this->postJson("/api/property-visits/{$visit->id}/confirm")->assertOk();

        $this->assertRappelsDuNouveauCreneau($visitor);
    }

    public function test_deplacement_par_l_agence_rend_les_deux_rappels_du_nouveau_creneau(): void
    {
        [$owner, $visitor, $visit] = $this->visiteRappeleeDeuxFois();

        Sanctum::actingAs($owner);
        $this->patchJson("/api/property-visits/{$visit->id}", [
            'scheduled_at' => $this->nouveauCreneau()->toIso8601String(),
        ])->assertOk();

        $this->assertSame(VisitStatus::Confirmed, $visit->fresh()->status);
        $this->assertRappelsDuNouveauCreneau($visitor);
    }

    public function test_une_modification_sans_changer_l_heure_garde_les_marques(): void
    {
        [$owner, $visitor, $visit] = $this->visiteRappeleeDeuxFois();

        Sanctum::actingAs($owner);
        $this->patchJson("/api/property-visits/{$visit->id}", ['notes' => 'Apporter les clés'])->assertOk();

        $metadata = $visit->fresh()->metadata;
        $this->assertNotEmpty($metadata['reminder_24h_sent_at'] ?? null);
        $this->assertNotEmpty($metadata['reminder_1h_sent_at'] ?? null);

        (new SendPropertyVisitReminders)->handle();
        $this->assertSame(2, $this->rappels($visitor));
    }

    /** @return array{0: User, 1: User, 2: PropertyVisit} */
    private function visiteRappeleeDeuxFois(): array
    {
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-11-02 09:00:00', 'UTC'));

        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => Carbon::parse('2026-11-03 09:00:00', 'UTC'),
            'duration_minutes' => 30,
        ]);

        (new SendPropertyVisitReminders)->handle();
        $this->travelTo(Carbon::parse('2026-11-03 08:00:00', 'UTC'));
        (new SendPropertyVisitReminders)->handle();

        $this->assertSame(2, $this->rappels($visitor), 'les deux rappels du premier créneau');

        return [$owner, $visitor, $visit];
    }

    private function nouveauCreneau(): Carbon
    {
        return Carbon::parse('2026-11-06 10:00:00', 'UTC');
    }

    private function assertRappelsDuNouveauCreneau(User $visitor): void
    {
        $this->travelTo($this->nouveauCreneau()->subHours(24));
        (new SendPropertyVisitReminders)->handle();
        $this->assertSame(3, $this->rappels($visitor), 'le rappel de la veille du nouveau créneau');

        $this->travelTo($this->nouveauCreneau()->subHour());
        (new SendPropertyVisitReminders)->handle();
        $this->assertSame(4, $this->rappels($visitor), 'le rappel de l\'heure du nouveau créneau');
    }

    private function rappels(User $visitor): int
    {
        return Notification::sent($visitor, CodedNotification::class)
            ->filter(fn (CodedNotification $n) => $n->code === NotificationCode::VisitReminder)
            ->count();
    }
}
