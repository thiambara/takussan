<?php

namespace Tests\Feature\TempsReel;

use App\Models\AppNotification;
use App\Models\User;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2955 (ADR-0129 § 2) — la cloche en direct : lire une notification, la rendre non lue ou tout lire
 * signale `notifications.updated` sur le canal personnel de la personne (`utilisateur.{id}`), sans objet
 * (`subject` = `utilisateur:{id}`). La création est tenue par
 * `EmetteurTest::test_notification_service_signale_notifications_updated_au_destinataire_et_rien_d_autre` (TCK-2952).
 *
 * Chaque test compte TOUS les envois du faux transport, pas seulement celui qu'il attend.
 */
class NotificationsEnDirectTest extends TestCase
{
    use RefreshDatabase;

    public function test_lire_une_notification_signale_la_cloche_de_son_destinataire_seul(): void
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->for($user)->create(['read_at' => null, 'is_read' => false]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($user);
        $this->postJson("/api/notifications/{$notification->id}/read")->assertOk();

        TempsReel::assertSignale(CodeDeSignal::NotificationsUpdated, "utilisateur.{$user->id}", "utilisateur:{$user->id}", 1);
        $this->assertCount(1, $faux->envois());
    }

    public function test_rendre_une_notification_non_lue_signale_la_cloche(): void
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->for($user)->create(['read_at' => now(), 'is_read' => true]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($user);
        $this->postJson("/api/notifications/{$notification->id}/unread")->assertOk();

        TempsReel::assertSignale(CodeDeSignal::NotificationsUpdated, "utilisateur.{$user->id}", "utilisateur:{$user->id}", 1);
        $this->assertCount(1, $faux->envois());
    }

    public function test_tout_lire_signale_la_cloche_une_fois(): void
    {
        $user = User::factory()->create();
        AppNotification::factory()->for($user)->count(3)->create(['read_at' => null, 'is_read' => false]);
        $faux = TempsReel::fake();

        Sanctum::actingAs($user);
        $this->postJson('/api/notifications/read-all')->assertOk();

        TempsReel::assertSignale(CodeDeSignal::NotificationsUpdated, "utilisateur.{$user->id}", "utilisateur:{$user->id}", 1);
        $this->assertCount(1, $faux->envois());
    }

    public function test_tout_lire_sans_rien_a_lire_ne_signale_rien(): void
    {
        $user = User::factory()->create();
        AppNotification::factory()->for($user)->create(['read_at' => now(), 'is_read' => true]);
        TempsReel::fake();

        Sanctum::actingAs($user);
        $this->postJson('/api/notifications/read-all')->assertOk();

        TempsReel::assertRienSignale();
    }

    public function test_la_notification_d_un_autre_refusee_ne_signale_rien(): void
    {
        $autre = User::factory()->create();
        $notification = AppNotification::factory()->for($autre)->create(['read_at' => null, 'is_read' => false]);
        TempsReel::fake();

        Sanctum::actingAs(User::factory()->create());
        $this->postJson("/api/notifications/{$notification->id}/read")->assertForbidden();

        TempsReel::assertRienSignale();
    }
}
