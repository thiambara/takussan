<?php

namespace Tests\Feature\Notifications;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\NotificationPreference;
use App\Models\Property;
use App\Models\User;
use App\Notifications\NewBookingNotification;
use App\Notifications\RegistrationConfirmationNotification;
use App\Notifications\ResetPasswordNotification;
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

    public function test_new_booking_notification_sends_to_mail_and_database_and_broadcast(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $user = User::factory()->create([
            'agency_id' => $agency->id,
            'notifications_email_enabled' => true,
            'notifications_push_enabled' => true,
        ]);
        $booking = $this->makeBookingFor($user);

        $user->notify(new NewBookingNotification($booking));

        Notification::assertSentTo($user, NewBookingNotification::class, function ($notification, $channels) {
            return in_array('mail', $channels)
                && in_array('database', $channels)
                && in_array('broadcast', $channels);
        });
    }

    public function test_new_booking_notification_respects_email_preference_disabled(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        // Flip the booking_request × email preference off via the canonical
        // matrix (the legacy flat boolean is no longer authoritative).
        NotificationPreference::updateOrCreate(
            ['user_id' => $user->id, 'event_type' => NewBookingNotification::EVENT_TYPE, 'channel' => 'email'],
            ['enabled' => false],
        );
        $booking = $this->makeBookingFor($user);

        $user->notify(new NewBookingNotification($booking));

        Notification::assertSentTo($user, NewBookingNotification::class, function ($notification, $channels) {
            return ! in_array('mail', $channels)
                && in_array('database', $channels)
                && in_array('broadcast', $channels);
        });
    }

    public function test_new_booking_notification_respects_push_preference_disabled(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        NotificationPreference::updateOrCreate(
            ['user_id' => $user->id, 'event_type' => NewBookingNotification::EVENT_TYPE, 'channel' => 'push'],
            ['enabled' => false],
        );
        $booking = $this->makeBookingFor($user);

        $user->notify(new NewBookingNotification($booking));

        Notification::assertSentTo($user, NewBookingNotification::class, function ($notification, $channels) {
            return in_array('mail', $channels)
                && in_array('database', $channels)
                && ! in_array('broadcast', $channels);
        });
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

    public function test_new_booking_notification_payload_includes_reference(): void
    {
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['agency_id' => $agency->id]);
        $booking = $this->makeBookingFor($user);

        $notification = new NewBookingNotification($booking);
        $payload = $notification->toArray($user);

        $this->assertSame($booking->id, $payload['booking_id']);
        $this->assertArrayHasKey('reference', $payload);
        $this->assertArrayHasKey('title', $payload);
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
