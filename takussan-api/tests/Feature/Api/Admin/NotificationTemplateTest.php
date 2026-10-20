<?php

namespace Tests\Feature\Api\Admin;

use App\Domain\Notifications\NotificationCode;
use App\Models\Booking;
use App\Models\NotificationTemplate;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Booking\BookingNotificationParams;
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

        // TCK-1053 — le gabarit `booking_confirmed` est lu par le code `booking.confirmed`, seul
        // envoi réel de la confirmation ; `NewBookingNotification`, sans émetteur, est retirée.
        $notification = new CodedNotification(
            NotificationCode::BookingConfirmed,
            BookingNotificationParams::for($booking, NotificationCode::BookingConfirmed),
        );

        app()->setLocale('fr');
        $mail = $notification->toMail($user);
        $this->assertSame('Sujet BK-1', $mail->subject);
        $this->assertStringContainsString('Corps Awa', implode("\n", $mail->introLines));

        NotificationTemplate::query()->update(['is_active' => false]);
        $fallback = $notification->toMail($user);
        $this->assertNotSame('Sujet BK-1', $fallback->subject);
    }

    /**
     * TCK-748 (P06.07) — chaque langue est pré-remplie depuis `lang/{locale}`, et l'enregistrement
     * ne persiste que les langues modifiées. Avant, `fallbackBody()` rendait le corps français pour
     * les trois langues, et la première sauvegarde écrivait ce français dans les lignes `en` et `wo`.
     */
    public function test_each_locale_is_prefilled_from_its_lang_file(): void
    {
        $this->actingAsRole('super_admin');

        foreach (['booking_confirmed', 'payment_received', 'maintenance_created'] as $event) {
            $templates = $this->getJson("/api/admin/notification-templates/{$event}/email")
                ->assertOk()
                ->json('data.templates');

            $this->assertSame(__("notifications.editable_templates.{$event}.body", [], 'fr'), $templates['fr']['body']);
            $this->assertSame(__("notifications.editable_templates.{$event}.body", [], 'en'), $templates['en']['body']);
            $this->assertSame(__("notifications.editable_templates.{$event}.subject", [], 'en'), $templates['en']['subject']);
            $this->assertNotSame($templates['fr']['body'], $templates['en']['body'], $event);
            $this->assertNotSame($templates['fr']['subject'], $templates['en']['subject'], $event);
        }
    }

    public function test_only_modified_locales_are_persisted(): void
    {
        $this->actingAsRole('super_admin');

        $templates = $this->getJson('/api/admin/notification-templates/booking_confirmed/email')
            ->json('data.templates');
        $englishBody = $templates['en']['body'];
        $templates['fr']['body'] = 'Bonjour {{ user.first_name }}, c\'est confirmé.';

        $this->patchJson('/api/admin/notification-templates/booking_confirmed/email', [
            'is_active' => true,
            'templates' => $templates,
        ])->assertOk()
            ->assertJsonPath('data.templates.fr.body', 'Bonjour {{ user.first_name }}, c\'est confirmé.')
            ->assertJsonPath('data.templates.en.body', $englishBody);

        $this->assertSame(
            ['fr'],
            NotificationTemplate::query()->where('event', 'booking_confirmed')->where('channel', 'email')
                ->pluck('locale')->all(),
        );

        // Une langue ajoutée ensuite s'écrit seule, et la ligne `fr` garde son texte.
        $templates['en']['body'] = 'Hello {{ user.first_name }}, confirmed.';
        $this->patchJson('/api/admin/notification-templates/booking_confirmed/email', [
            'is_active' => true,
            'templates' => $templates,
        ])->assertOk();

        $this->assertEqualsCanonicalizing(
            ['fr', 'en'],
            NotificationTemplate::query()->where('event', 'booking_confirmed')->where('channel', 'email')
                ->pluck('locale')->all(),
        );
    }

    public function test_deactivating_an_untouched_template_is_kept(): void
    {
        $this->actingAsRole('super_admin');

        $templates = $this->getJson('/api/admin/notification-templates/payment_received/sms')
            ->json('data.templates');

        $this->patchJson('/api/admin/notification-templates/payment_received/sms', [
            'is_active' => false,
            'templates' => $templates,
        ])->assertOk()
            ->assertJsonPath('data.is_active', false);
    }
}
