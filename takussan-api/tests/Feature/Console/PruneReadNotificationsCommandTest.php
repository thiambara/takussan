<?php

namespace Tests\Feature\Console;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-918 (P19.06) — décision du porteur : les notifications in-app lues sont purgées 6 mois
 * après leur lecture. Une notification non lue n'est jamais touchée, quel que soit son âge.
 */
class PruneReadNotificationsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_purge_supprime_les_notifications_lues_depuis_plus_de_six_mois(): void
    {
        $vieilleLue = $this->notification(creeIlYa: now()->subYear(), lueIlYa: now()->subMonths(6)->subDay());
        $recenteLue = $this->notification(creeIlYa: now()->subYear(), lueIlYa: now()->subMonths(5));
        $vieilleNonLue = $this->notification(creeIlYa: now()->subYears(2), lueIlYa: null);
        $tentative = NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $vieilleLue->id,
            'attempt' => 1,
            'provider' => 'log',
            'provider_message_id' => 'tck-918',
            'to' => '+221771234567',
            'status' => 'sent',
        ]);

        $this->artisan('notifications:prune-read')->assertSuccessful();

        $this->assertModelMissing($vieilleLue);
        $this->assertModelMissing($tentative);
        $this->assertModelExists($recenteLue);
        $this->assertModelExists($vieilleNonLue);
    }

    public function test_la_purge_est_planifiee_chaque_jour_sans_chevauchement(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->command, 'notifications:prune-read'));

        $this->assertNotNull($event, 'notifications:prune-read doit être planifiée.');
        $this->assertSame('5 4 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    private function notification(\DateTimeInterface $creeIlYa, ?\DateTimeInterface $lueIlYa): AppNotification
    {
        $notification = AppNotification::factory()->create();
        $notification->forceFill([
            'created_at' => $creeIlYa,
            'updated_at' => $lueIlYa ?? $creeIlYa,
            'is_read' => $lueIlYa !== null,
            'read_at' => $lueIlYa,
        ])->save();

        return $notification;
    }
}
