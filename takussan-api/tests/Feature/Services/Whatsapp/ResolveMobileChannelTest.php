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

    /**
     * TCK-1094 (P72.02) — `phone_whatsapp` déclaré par l'utilisateur décide du canal mobile d'un
     * événement à défaut mobile (WhatsApp et SMS allumés sans préférence) : `false` passe au
     * SMS, `true` et `null` (« non dit ») gardent WhatsApp.
     */
    public function test_phone_declared_without_whatsapp_routes_to_sms(): void
    {
        $user = $this->user();
        $user->forceFill(['phone_whatsapp' => false])->save();

        $this->assertSame(
            PreferenceResolver::CHANNEL_SMS,
            app(PreferenceResolver::class)->resolveMobileChannel($user->refresh(), 'lease_payment_overdue'),
        );
    }

    public function test_phone_declared_with_whatsapp_keeps_whatsapp(): void
    {
        $user = $this->user();
        $user->forceFill(['phone_whatsapp' => true])->save();

        $this->assertSame(
            PreferenceResolver::CHANNEL_WHATSAPP,
            app(PreferenceResolver::class)->resolveMobileChannel($user->refresh(), 'lease_payment_overdue'),
        );
    }

    public function test_phone_whatsapp_unknown_keeps_the_default(): void
    {
        $user = $this->user();
        $user->forceFill(['phone_whatsapp' => null])->save();

        $this->assertNull($user->refresh()->phone_whatsapp);
        $this->assertSame(
            PreferenceResolver::CHANNEL_WHATSAPP,
            app(PreferenceResolver::class)->resolveMobileChannel($user, 'lease_payment_overdue'),
        );
    }

    /** Même une préférence WhatsApp explicite ne l'emporte pas sur la déclaration. */
    public function test_phone_declared_without_whatsapp_overrides_an_explicit_opt_in(): void
    {
        $user = $this->user();
        $user->forceFill(['phone_whatsapp' => false])->save();
        $this->optIn($user, 'whatsapp');
        $this->optIn($user, 'sms');

        $this->assertSame(
            PreferenceResolver::CHANNEL_SMS,
            app(PreferenceResolver::class)->resolveMobileChannel($user->refresh(), 'booking_request'),
        );
    }
}
