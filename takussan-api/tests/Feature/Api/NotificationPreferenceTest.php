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

        $this->getJson('/api/notifications/preferences')
            ->assertOk()
            ->assertJsonStructure(['data' => [
                'notifications_email_enabled',
                'notifications_push_enabled',
                'notifications_sms_enabled',
            ]]);
    }

    public function test_user_can_update_notification_preferences(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/notifications/preferences', [
            'notifications_email_enabled' => false,
            'notifications_push_enabled' => true,
        ])->assertOk()
            ->assertJsonPath('data.notifications_email_enabled', false)
            ->assertJsonPath('data.notifications_push_enabled', true);
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

        return collect($this->getJson('/api/notifications/preferences')->assertOk()->json('data.preferences'))
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

    public function test_ac16_activer_une_case_indisponible_ne_cree_aucune_ligne(): void
    {
        $user = User::factory()->create(['phone_verified_at' => now()]);
        Sanctum::actingAs($user);
        NotificationPreference::query()->where('user_id', $user->id)->where('event_type', 'review_received')->where('channel', 'sms')->delete();

        $this->putJson('/api/notifications/preferences', [
            'preferences' => [['event_type' => 'review_received', 'channel' => 'sms', 'enabled' => true]],
        ])->assertOk();

        $this->assertFalse(NotificationPreference::query()
            ->where('user_id', $user->id)->where('event_type', 'review_received')->where('channel', 'sms')
            ->exists());
    }

    public function test_unauthenticated_cannot_access_preferences(): void
    {
        $this->getJson('/api/notifications/preferences')
            ->assertUnauthorized();
    }
}
