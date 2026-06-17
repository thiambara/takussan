<?php

namespace Tests\Feature\Services\Whatsapp;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-282 — Mutually-exclusive mobile channel selection (AC5): the resolver
 * returns at most one of `whatsapp` / `sms`, WhatsApp first.
 */
class ResolveMobileChannelTest extends TestCase
{
    use RefreshDatabase;

    private function user(bool $verified = true): User
    {
        return User::factory()->create([
            'phone' => '+221761234567',
            'phone_verified_at' => $verified ? now() : null,
        ]);
    }

    private function optIn(User $user, string $channel): void
    {
        NotificationPreference::updateOrCreate(
            ['user_id' => $user->id, 'event_type' => 'booking_request', 'channel' => $channel],
            ['enabled' => true],
        );
    }

    public function test_prefers_whatsapp_when_both_opted_in(): void
    {
        $user = $this->user();
        $this->optIn($user, 'whatsapp');
        $this->optIn($user, 'sms');

        $this->assertSame(
            PreferenceResolver::CHANNEL_WHATSAPP,
            app(PreferenceResolver::class)->resolveMobileChannel($user, 'booking_request'),
        );
    }

    public function test_falls_back_to_sms_when_only_sms_opted_in(): void
    {
        $user = $this->user();
        $this->optIn($user, 'sms');

        $this->assertSame(
            PreferenceResolver::CHANNEL_SMS,
            app(PreferenceResolver::class)->resolveMobileChannel($user, 'booking_request'),
        );
    }

    public function test_null_when_no_mobile_opt_in(): void
    {
        $user = $this->user();

        $this->assertNull(
            app(PreferenceResolver::class)->resolveMobileChannel($user, 'booking_request'),
        );
    }

    public function test_null_when_phone_unverified_even_if_opted_in(): void
    {
        $user = $this->user(verified: false);
        $this->optIn($user, 'whatsapp');
        $this->optIn($user, 'sms');

        $this->assertNull(
            app(PreferenceResolver::class)->resolveMobileChannel($user, 'booking_request'),
        );
    }
}
