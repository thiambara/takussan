<?php

namespace Tests\Feature\Visits;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendPropertyVisitReminders;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\CodedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-2502 AC4 — aucun rappel « 1 h avant » (ni « 24 h ») pour une visite dont l'heure n'est pas
 * fixée : son `scheduled_at` n'est que le début d'une tranche.
 *
 * Par l'API, une visite à tranche ne devient pas `confirmed` sans heure (`visit.time_required`) ;
 * l'état est posé ici en base pour éprouver le rappel lui-même, quel que soit le chemin qui l'aurait
 * produit.
 */
class VisitRemindersSkipUnfixedTest extends TestCase
{
    use RefreshDatabase;

    public function test_aucun_rappel_pour_une_visite_a_heure_non_fixee(): void
    {
        Notification::fake();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => User::factory()->create()->id]);

        $tranche = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addHour(),
            'duration_minutes' => 30,
        ]);
        DB::table('property_visits')->where('id', $tranche->id)->update(['preferred_window' => VisitWindow::Afternoon->value]);

        (new SendPropertyVisitReminders)->handle();

        $this->assertSame(0, $this->rappels($visitor));
        $this->assertEmpty($tranche->fresh()->metadata['reminder_1h_sent_at'] ?? null);

        // Témoin : la même visite, heure fixée, est rappelée.
        DB::table('property_visits')->where('id', $tranche->id)->update(['preferred_window' => null]);
        (new SendPropertyVisitReminders)->handle();
        $this->assertSame(1, $this->rappels($visitor));
    }

    private function rappels(User $visitor): int
    {
        return Notification::sent($visitor, CodedNotification::class)
            ->filter(fn (CodedNotification $n) => $n->code === NotificationCode::VisitReminder)
            ->count();
    }
}
