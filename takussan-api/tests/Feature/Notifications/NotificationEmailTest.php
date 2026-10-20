<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\NotificationPreference;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ResetPasswordNotification;
use App\Services\Booking\BookingNotificationParams;
use Illuminate\Auth\Events\Registered;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class NotificationEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_confirmation_notification_is_sent_on_registered_event(): void
    {
        Notification::fake();

        $user = User::factory()->unverified()->create();
        event(new Registered($user));

        Notification::assertSentTo($user, RegistrationConfirmationNotification::class);
    }

    public function test_registration_confirmation_mail_contains_verify_action(): void
    {
        $user = User::factory()->create();
        $notification = new RegistrationConfirmationNotification;
        $mail = $notification->toMail($user);

        // `json_encode` escapes UTF-8 by default (é → é). Serialize
        // with JSON_UNESCAPED_UNICODE so the assertion can match against
        // the real translation string.
        $rendered = json_encode($mail->toArray(), JSON_UNESCAPED_UNICODE);
        $this->assertStringContainsString(__('notifications.registration.action'), $rendered);
    }

    public function test_password_reset_sends_custom_notification(): void
    {
        Notification::fake();

        $user = User::factory()->create();
        Password::sendResetLink(['email' => $user->email]);

        Notification::assertSentTo($user, ResetPasswordNotification::class);
    }

    public function test_password_reset_mail_is_localized_in_french(): void
    {
        app()->setLocale('fr');
        $user = User::factory()->create();
        $notification = new ResetPasswordNotification('fake-token');

        $mail = $notification->toMail($user);

        $this->assertSame(
            __('notifications.password_reset.subject'),
            $mail->subject,
        );
    }

    /**
     * TCK-1053 (P75.01) — la demande de réservation part par le code `booking.created`
     * (`NotifyOnBookingRequested`) : e-mail selon la préférence, jamais sur mobile (TCK-590,
     * contrainte 4). Ces tests visaient `NewBookingNotification`, classe sans émetteur, retirée.
     */
    public function test_la_demande_de_reservation_part_par_e_mail_et_jamais_sur_mobile(): void
    {
        $user = User::factory()->create(['phone_verified_at' => now()]);
        $booking = $this->makeBookingFor($user);

        $channels = $this->demande($booking)->via($user);

        $this->assertContains('mail', $channels);
        $this->assertNotContains('sms', $channels);
        $this->assertNotContains('whatsapp', $channels);
    }

    public function test_la_demande_de_reservation_respecte_la_preference_e_mail_coupee(): void
    {
        $user = User::factory()->create();
        NotificationPreference::updateOrCreate(
            ['user_id' => $user->id, 'event_type' => 'booking_request', 'channel' => 'email'],
            ['enabled' => false],
        );
        $booking = $this->makeBookingFor($user);

        $this->assertNotContains('mail', $this->demande($booking)->via($user));
    }

    private function demande(Booking $booking): CodedNotification
    {
        return new CodedNotification(
            NotificationCode::BookingCreated,
            BookingNotificationParams::for($booking, NotificationCode::BookingCreated),
        );
    }

    public function test_user_implements_has_locale_preference_for_queued_notifications(): void
    {
        // Regression: queued notifications run on a worker where app locale
        // defaults to config value. Laravel only swaps to the user's locale
        // for recipients implementing HasLocalePreference::preferredLocale().
        // Without it, emails go out in the default locale regardless of
        // `preferred_language` — breaking TCK-022 AC.
        $user = User::factory()->create(['preferred_language' => 'fr']);

        $this->assertInstanceOf(
            HasLocalePreference::class,
            $user,
            'User must implement HasLocalePreference so queued notifications pick up preferred_language.',
        );
        $this->assertSame('fr', $user->preferredLocale());
    }

    protected function makeBookingFor(User $user): Booking
    {
        $property = Property::factory()->create(['user_id' => $user->id]);

        $customer = Customer::factory()->create([
            'added_by_id' => $user->id,
            'user_id' => $user->id,
        ]);

        return Booking::factory()->create([
            'customer_id' => $customer->id,
            'property_id' => $property->id,
            'created_by_id' => $user->id,
        ]);
    }
}
