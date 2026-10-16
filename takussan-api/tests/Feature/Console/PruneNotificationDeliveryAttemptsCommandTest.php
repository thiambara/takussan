<?php

namespace Tests\Feature\Console;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-691 (P19.02) — chaque tentative d'envoi SMS ou WhatsApp garde le numéro du destinataire
 * (`to`). Décision du porteur : les tentatives sont purgées après 90 jours, par une commande
 * planifiée. La notification elle-même n'est pas touchée.
 */
class PruneNotificationDeliveryAttemptsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_purge_supprime_les_tentatives_de_plus_de_90_jours(): void
    {
        $notification = AppNotification::factory()->create();
        $vieille = $this->tentativeAgee($notification, 91);
        $recente = $this->tentativeAgee($notification, 89);

        $this->artisan('notifications:prune-delivery-attempts')->assertSuccessful();

        $this->assertModelMissing($vieille);
        $this->assertModelExists($recente);
        $this->assertModelExists($notification);
    }

    public function test_la_purge_est_planifiee_chaque_jour_sans_chevauchement(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->command, 'notifications:prune-delivery-attempts'));

        $this->assertNotNull($event, 'notifications:prune-delivery-attempts doit être planifiée.');
        $this->assertSame('50 3 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    private function tentativeAgee(AppNotification $notification, int $jours): NotificationDeliveryAttempt
    {
        $tentative = NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => $jours,
            'provider' => 'log',
            'provider_message_id' => 'p19-'.$jours,
            'to' => '+221771234567',
            'status' => 'sent',
        ]);
        $tentative->forceFill(['created_at' => now()->subDays($jours), 'updated_at' => now()->subDays($jours)])->save();

        return $tentative;
    }
}
