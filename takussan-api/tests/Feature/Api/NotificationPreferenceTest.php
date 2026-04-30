<?php

namespace Tests\Feature\Api;

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

    public function test_unauthenticated_cannot_access_preferences(): void
    {
        $this->getJson('/api/notifications/preferences')
            ->assertUnauthorized();
    }
}
