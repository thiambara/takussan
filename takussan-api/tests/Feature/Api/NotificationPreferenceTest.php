<?php

namespace Tests\Feature\Api;

use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_get_notification_preferences(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/me/notification-preferences')
            ->assertOk()
            ->assertJsonStructure(['data' => ['notifications_email_enabled']])
            // TCK-1495 (P107.02) — aucun envoi ne lit ces deux drapeaux : ils quittent le contrat.
            ->assertJsonMissingPath('data.notifications_push_enabled')
            ->assertJsonMissingPath('data.notifications_sms_enabled');
    }

    /**
     * TCK-1495 (P107.02, porteur 2026-10-22) — `notifications_sms_enabled` et
     * `notifications_push_enabled` ne s'écrivent plus : un client qui les envoie croyait couper un
     * canal que la matrice seule commande. Les colonnes restent.
     */
    public function test_les_drapeaux_sms_et_push_ne_s_ecrivent_plus(): void
    {
        $user = User::factory()->create(['notifications_sms_enabled' => true, 'notifications_push_enabled' => true]);
        Sanctum::actingAs($user);

        $this->patchJson('/api/me/notification-preferences', [
            'notifications_sms_enabled' => false,
            'notifications_push_enabled' => false,
        ])->assertOk()
            ->assertJsonMissingPath('data.notifications_sms_enabled')
            ->assertJsonMissingPath('data.notifications_push_enabled');

        $user->refresh();
        $this->assertTrue($user->notifications_sms_enabled);
        $this->assertTrue($user->notifications_push_enabled);
    }

    public function test_user_can_update_notification_preferences(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/me/notification-preferences', [
            'notifications_email_enabled' => false,
        ])->assertOk()
            ->assertJsonPath('data.notifications_email_enabled', false);
    }

    public function test_matrix_update_returns_complete_payload(): void
    {
        $user = User::factory()->create(['phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $this->patchJson('/api/me/notification-preferences', [
            'preferences' => [[
                'event_type' => 'message_received',
                'channel' => 'email',
                'enabled' => false,
            ]],
        ])->assertOk()
            ->assertJsonStructure(['data' => [
                'preferences',
                'events',
                'channels',
                'phone_verified',
            ]])
            ->assertJsonPath('data.phone_verified', false)
            ->assertJsonPath('data.channels.0', 'inapp');
    }

    /**
     * TCK-588, AC16 — la matrice ne promet que ce qu'un envoi peut honorer. Sans transport temps
     * réel (`BROADCAST_CONNECTION=log`), aucune case `push` ; un événement qu'aucune notification
     * mobile n'émet, aucune case SMS/WhatsApp.
     *
     * @return array<string, array<string, mixed>>
     */
    private function matrix(User $user): array
    {
        config()->set('broadcasting.default', 'log');
        Sanctum::actingAs($user);

        return collect($this->getJson('/api/me/notification-preferences')->assertOk()->json('data.preferences'))
            ->keyBy(fn (array $cell) => "{$cell['event_type']}|{$cell['channel']}")
            ->all();
    }

    public function test_ac16_aucune_case_push_sans_transport_temps_reel(): void
    {
        $push = array_filter($this->matrix(User::factory()->create(['phone_verified_at' => now()])), fn (array $cell) => $cell['channel'] === 'push');

        $this->assertNotEmpty($push);
        foreach ($push as $key => $cell) {
            $this->assertTrue($cell['locked'], $key);
            $this->assertFalse($cell['enabled'], $key);
            $this->assertSame('channel_unavailable', $cell['reason'] ?? null, $key);
        }
    }

    public function test_ac16_les_cases_mobiles_suivent_les_envois_reels(): void
    {
        $matrix = $this->matrix(User::factory()->create(['phone_verified_at' => now()]));

        $this->assertTrue($matrix['review_received|whatsapp']['locked']);
        $this->assertSame('channel_unavailable', $matrix['review_received|whatsapp']['reason']);

        $overdue = $matrix['lease_payment_overdue|whatsapp'];
        $this->assertFalse($overdue['locked']);
        $this->assertTrue($overdue['enabled'], 'défaut retenu pour un événement mobile');
        $this->assertArrayNotHasKey('reason', $overdue);
    }

    /**
     * TCK-1053 (P75.01) — la demande de réservation ne part pas sur mobile (TCK-590, contrainte 4) :
     * ses cases SMS et WhatsApp sont verrouillées. Elles étaient ouvertes par la seule présence de
     * `NewBookingNotification`, sans émetteur, dans `MOBILE_CLASS_EVENTS`.
     */
    public function test_les_cases_mobiles_de_la_demande_de_reservation_sont_verrouillees(): void
    {
        $matrix = $this->matrix(User::factory()->create(['phone_verified_at' => now()]));

        foreach (['sms', 'whatsapp'] as $canal) {
            $cell = $matrix["booking_request|{$canal}"];
            $this->assertTrue($cell['locked'], $canal);
            $this->assertFalse($cell['enabled'], $canal);
            $this->assertSame('channel_unavailable', $cell['reason'] ?? null, $canal);
        }
        $this->assertFalse($matrix['booking_request|email']['locked']);
    }

    public function test_ac16_activer_une_case_indisponible_ne_cree_aucune_ligne(): void
    {
        $user = User::factory()->create(['phone_verified_at' => now()]);
        Sanctum::actingAs($user);
        NotificationPreference::query()->where('user_id', $user->id)->where('event_type', 'review_received')->where('channel', 'sms')->delete();

        $this->putJson('/api/me/notification-preferences', [
            'preferences' => [['event_type' => 'review_received', 'channel' => 'sms', 'enabled' => true]],
        ])->assertOk();

        $this->assertFalse(NotificationPreference::query()
            ->where('user_id', $user->id)->where('event_type', 'review_received')->where('channel', 'sms')
            ->exists());
    }

    public function test_unauthenticated_cannot_access_preferences(): void
    {
        $this->getJson('/api/me/notification-preferences')
            ->assertUnauthorized();
    }
}
