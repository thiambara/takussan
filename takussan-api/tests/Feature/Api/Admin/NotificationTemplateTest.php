<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Booking;
use App\Models\NotificationTemplate;
use App\Models\User;
use App\Notifications\NewBookingNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class NotificationTemplateTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_update_and_preview_template(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/notification-templates/booking_confirmed/email', [
            'is_active' => true,
            'templates' => [
                'fr' => [
                    'subject' => 'Réservation {{ booking.code }}',
                    'body' => 'Bonjour {{ user.first_name }}, {{ property.title }} est confirmée.',
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.templates.fr.subject', 'Réservation {{ booking.code }}');

        $this->postJson('/api/admin/notification-templates/booking_confirmed/email/preview', [
            'locale' => 'fr',
        ])->assertOk()
            ->assertJsonPath('data.subject', 'Réservation BK-2026-001')
            ->assertJsonPath('data.body', 'Bonjour Awa, Villa Almadies est confirmée.');

        $this->assertTrue(Activity::query()->where('event', 'super_admin_notification_template_updated')->exists());
    }

    public function test_unknown_placeholder_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/notification-templates/booking_confirmed/email', [
            'templates' => [
                'fr' => ['subject' => 'Test', 'body' => 'Bonjour {{ unknown }}'],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('templates.fr.body');
    }

    public function test_sms_longer_than_six_segments_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->patchJson('/api/admin/notification-templates/booking_confirmed/sms', [
            'templates' => [
                'fr' => ['body' => str_repeat('a', 961)],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('templates.fr.body');
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/notification-templates')->assertForbidden();
        $this->patchJson('/api/admin/notification-templates/booking_confirmed/email', [
            'templates' => ['fr' => ['subject' => 'x', 'body' => 'x']],
        ])->assertForbidden();
    }

    public function test_booking_mail_uses_active_template_and_falls_back_when_disabled(): void
    {
        $booking = Booking::factory()->create(['reference_number' => 'BK-1']);
        $user = User::factory()->create(['first_name' => 'Awa']);

        NotificationTemplate::create([
            'event' => 'booking_confirmed',
            'channel' => 'email',
            'locale' => 'fr',
            'subject' => 'Sujet {{ booking.code }}',
            'body' => 'Corps {{ user.first_name }}',
            'is_active' => true,
        ]);

        app()->setLocale('fr');
        $mail = (new NewBookingNotification($booking))->toMail($user);
        $this->assertSame('Sujet BK-1', $mail->subject);
        $this->assertStringContainsString('Corps Awa', implode("\n", $mail->introLines));

        NotificationTemplate::query()->update(['is_active' => false]);
        $fallback = (new NewBookingNotification($booking))->toMail($user);
        $this->assertNotSame('Sujet BK-1', $fallback->subject);
    }
}
