<?php

namespace Tests\Feature\Notifications;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_matrix_endpoint_returns_full_grid_with_defaults(): void
    {
        $user = User::factory()->create(['phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/me/notification-preferences')->assertOk();

        $data = $response->json('data');
        $this->assertEquals(PreferenceResolver::EVENTS, $data['events']);
        $this->assertEquals(PreferenceResolver::CHANNELS, $data['channels']);
        $this->assertFalse($data['phone_verified']);

        $preferences = $data['preferences'];
        $this->assertCount(
            count(PreferenceResolver::EVENTS) * count(PreferenceResolver::CHANNELS),
            $preferences,
        );

        // Every inapp cell should be locked + enabled.
        $inappCells = array_filter($preferences, fn ($c) => $c['channel'] === 'inapp');
        foreach ($inappCells as $cell) {
            $this->assertTrue($cell['locked']);
            $this->assertTrue($cell['enabled']);
        }

        // SMS is locked because phone is unverified.
        $smsCells = array_filter($preferences, fn ($c) => $c['channel'] === 'sms');
        foreach ($smsCells as $cell) {
            $this->assertTrue($cell['locked']);
            $this->assertFalse($cell['enabled']);
        }
    }

    public function test_patch_updates_specific_cells(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/me/notification-preferences', [
            'preferences' => [
                ['event_type' => 'message_received', 'channel' => 'email', 'enabled' => false],
                ['event_type' => 'booking_request', 'channel' => 'email', 'enabled' => true],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $user->id,
            'event_type' => 'message_received',
            'channel' => 'email',
            'enabled' => false,
        ]);
        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $user->id,
            'event_type' => 'booking_request',
            'channel' => 'email',
            'enabled' => true,
        ]);
    }

    public function test_patch_silently_ignores_unknown_events_and_channels(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        // Baseline — UserObserver provisions the default matrix (inapp excluded).
        $baseline = NotificationPreference::where('user_id', $user->id)->count();

        $this->patchJson('/api/me/notification-preferences', [
            'preferences' => [
                ['event_type' => 'unknown_event', 'channel' => 'email', 'enabled' => true],
                ['event_type' => 'message_received', 'channel' => 'carrier-pigeon', 'enabled' => true],
            ],
        ])->assertOk();

        // Invalid entries never persist — count stays at the observer baseline.
        $this->assertSame(
            $baseline,
            NotificationPreference::where('user_id', $user->id)->count(),
        );
        $this->assertDatabaseMissing('notification_preferences', [
            'user_id' => $user->id,
            'event_type' => 'unknown_event',
        ]);
        $this->assertDatabaseMissing('notification_preferences', [
            'user_id' => $user->id,
            'channel' => 'carrier-pigeon',
        ]);
    }

    public function test_patch_does_not_persist_inapp_toggles(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/me/notification-preferences', [
            'preferences' => [
                ['event_type' => 'message_received', 'channel' => 'inapp', 'enabled' => false],
            ],
        ])->assertOk();

        // The UserObserver never seeds inapp rows, and the PATCH handler refuses
        // them — so no inapp rows should ever exist regardless of the baseline.
        $this->assertDatabaseMissing('notification_preferences', [
            'user_id' => $user->id,
            'channel' => 'inapp',
        ]);
    }

    public function test_resolver_enforces_inapp_always_on(): void
    {
        $user = User::factory()->create();
        NotificationPreference::create([
            'user_id' => $user->id,
            'event_type' => 'message_received',
            'channel' => 'inapp',
            'enabled' => false, // attempt to force-disable
        ]);

        $resolver = app(PreferenceResolver::class);
        $this->assertTrue($resolver->shouldSend($user, 'message_received', 'inapp'));
    }

    public function test_resolver_bypasses_preferences_for_critical_events(): void
    {
        $user = User::factory()->create();
        NotificationPreference::create([
            'user_id' => $user->id,
            'event_type' => 'password_reset',
            'channel' => 'email',
            'enabled' => false, // user tries to silence critical email
        ]);

        $resolver = app(PreferenceResolver::class);
        $this->assertTrue($resolver->shouldSend($user, 'password_reset', 'email'));
        $this->assertTrue($resolver->shouldSend($user, 'password_reset', 'inapp'));
    }

    public function test_resolver_blocks_sms_without_verified_phone(): void
    {
        $user = User::factory()->create(['phone_verified_at' => null]);
        // Observer already created this row with enabled=false — flip it on
        // to confirm the resolver still blocks the channel.
        NotificationPreference::updateOrCreate(
            [
                'user_id' => $user->id,
                'event_type' => 'booking_request',
                'channel' => 'sms',
            ],
            ['enabled' => true],
        );

        $resolver = app(PreferenceResolver::class);
        $this->assertFalse($resolver->shouldSend($user, 'booking_request', 'sms'));
    }

    public function test_resolver_applies_defaults_for_missing_rows(): void
    {
        $user = User::factory()->create(['phone_verified_at' => now()]);
        $resolver = app(PreferenceResolver::class);

        $this->assertTrue($resolver->shouldSend($user, 'booking_request', 'email'));
        $this->assertTrue($resolver->shouldSend($user, 'booking_request', 'push'));
        $this->assertFalse($resolver->shouldSend($user, 'booking_request', 'sms'));
    }

    public function test_endpoint_requires_auth(): void
    {
        $this->getJson('/api/me/notification-preferences')->assertUnauthorized();
        $this->patchJson('/api/me/notification-preferences', ['preferences' => []])->assertUnauthorized();
    }

    public function test_new_user_gets_default_preferences_created(): void
    {
        $user = User::factory()->create();

        $expectedCount = count(PreferenceResolver::EVENTS)
            * (count(PreferenceResolver::CHANNELS) - 1); // inapp excluded

        $this->assertSame(
            $expectedCount,
            NotificationPreference::where('user_id', $user->id)->count(),
        );
    }
}
