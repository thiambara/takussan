<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Model\BookingService;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-588, AC5 et AC10 — chaque interrupteur commande SON message.
 *
 * Avant : `TYPE_TO_EVENT` associait un TYPE à un interrupteur. `payment` → « échéance » coupait
 * aussi le reçu de paiement et laissait le retard sans interrupteur ; `booking` → « nouvelle
 * demande » commandait la confirmation ; `system` → « Alerte seuil KPI » commandait l'e-mail
 * « KYC rejeté ».
 */
class NotificationPreferenceRoutingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function user(bool $phoneVerified = true): User
    {
        return User::factory()->create(['phone_verified_at' => $phoneVerified ? now() : null]);
    }

    private function prefer(User $user, string $event, string $channel, bool $enabled): void
    {
        NotificationPreference::query()->updateOrCreate(
            ['user_id' => $user->id, 'event_type' => $event, 'channel' => $channel],
            ['enabled' => $enabled],
        );
    }

    /** @return list<string> */
    private function channels(User $user, NotificationCode $code): array
    {
        $found = null;
        Notification::assertSentTo($user, CodedNotification::class, function (CodedNotification $n, array $channels) use ($code, &$found) {
            if ($n->code === $code) {
                $found = $channels;

                return true;
            }

            return false;
        });

        return $found ?? [];
    }

    private function send(User $user, NotificationCode $code): void
    {
        $params = array_map(fn () => null, $code->params());
        if (array_key_exists('amount', $params)) {
            $params['amount'] = NotificationRenderer::money(1000, 'XOF');
        }
        app(NotificationService::class)->send($user, $code, $params);
    }

    public function test_whatsapp_coupe_pour_l_echeance_le_retard_part_quand_meme_sur_whatsapp(): void
    {
        $tenant = $this->user();
        $this->prefer($tenant, 'lease_payment_due', 'whatsapp', false);

        $this->send($tenant, NotificationCode::LeasePaymentOverdue);
        $this->send($tenant, NotificationCode::LeasePaymentDueSoon);

        $this->assertContains('whatsapp', $this->channels($tenant, NotificationCode::LeasePaymentOverdue));
        $this->assertNotContains('whatsapp', $this->channels($tenant, NotificationCode::LeasePaymentDueSoon));
    }

    public function test_e_mail_coupe_pour_nouvelle_demande_la_confirmation_part_quand_meme(): void
    {
        $customer = $this->user();
        $this->prefer($customer, 'booking_request', 'email', false);

        $this->send($customer, NotificationCode::BookingConfirmed);

        $this->assertContains('mail', $this->channels($customer, NotificationCode::BookingConfirmed));
    }

    public function test_e_mail_coupe_pour_statut_de_reservation_la_confirmation_ne_part_pas_par_e_mail(): void
    {
        $customer = $this->user();
        $this->prefer($customer, 'booking_status_changed', 'email', false);

        $this->send($customer, NotificationCode::BookingConfirmed);

        $this->assertNotContains('mail', $this->channels($customer, NotificationCode::BookingConfirmed));
    }

    public function test_e_mail_coupe_pour_l_alerte_kpi_le_verdict_kyc_part_quand_meme(): void
    {
        $admin = $this->user();
        $this->prefer($admin, 'threshold_alert', 'email', false);

        $this->send($admin, NotificationCode::KycRejected);

        $this->assertContains('mail', $this->channels($admin, NotificationCode::KycRejected));
    }

    public function test_e_mail_coupe_pour_l_echeance_le_recu_de_paiement_part_quand_meme(): void
    {
        $tenant = $this->user();
        $this->prefer($tenant, 'lease_payment_due', 'email', false);

        $this->send($tenant, NotificationCode::LeasePaymentRecorded);

        $this->assertContains('mail', $this->channels($tenant, NotificationCode::LeasePaymentRecorded));
    }

    public function test_defauts_sans_aucune_ligne_le_retard_part_sur_un_canal_mobile_si_le_telephone_est_verifie(): void
    {
        $verified = $this->user();
        $unverified = $this->user(phoneVerified: false);
        NotificationPreference::query()->whereIn('user_id', [$verified->id, $unverified->id])->delete();

        $this->send($verified, NotificationCode::LeasePaymentOverdue);
        $this->send($unverified, NotificationCode::LeasePaymentOverdue);

        $this->assertNotEmpty(array_intersect(['whatsapp', 'sms'], $this->channels($verified, NotificationCode::LeasePaymentOverdue)));
        $this->assertEmpty(array_intersect(['whatsapp', 'sms'], $this->channels($unverified, NotificationCode::LeasePaymentOverdue)));
    }

    public function test_un_utilisateur_cree_par_l_application_a_les_defauts_mobiles(): void
    {
        $tenant = $this->user();

        $this->send($tenant, NotificationCode::LeasePaymentOverdue);

        $this->assertContains('whatsapp', $this->channels($tenant, NotificationCode::LeasePaymentOverdue));
    }

    public function test_ac10_la_confirmation_d_une_reservation_part_sur_whatsapp(): void
    {
        $client = $this->user();
        $this->prefer($client, 'booking_status_changed', 'whatsapp', true);
        $booking = Booking::factory()->create([
            'customer_id' => Customer::factory()->create(['user_id' => $client->id])->id,
        ]);

        app(BookingService::class)->confirm($booking);

        $this->assertContains('whatsapp', $this->channels($client, NotificationCode::BookingConfirmed));
    }
}
