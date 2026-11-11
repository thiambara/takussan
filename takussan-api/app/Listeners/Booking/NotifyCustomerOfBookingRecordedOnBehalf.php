<?php

namespace App\Listeners\Booking;

use App\Domain\Notifications\NotificationCode;
use App\Events\Booking\BookingRequested;
use App\Listeners\Payments\NotifyPartiesOfRentRefund;
use App\Models\Booking;
use App\Services\Booking\BookingNotificationParams;
use App\Services\Model\NotificationService;
use App\Services\Notifications\ContactSansCompte;
use App\Support\Logging\SafeExceptionContext;
use Illuminate\Support\Facades\Log;

/**
 * TCK-2579 (ADR-0102 §2) — une demande enregistrée par le personnel AU NOM d'un client : le client
 * en est prévenu, avec la référence, et peut l'annuler. Son compte s'il en a un (canaux de ses
 * préférences, et le numéro de sa fiche faute de téléphone vérifié, TCK-1493) ; sans compte, le
 * téléphone de sa fiche. Même forme que l'avis de remboursement ({@see NotifyPartiesOfRentRefund}).
 *
 * L'auteur n'est jamais prévenu de son propre geste ; le bailleur et les agents du bien le restent
 * par {@see NotifyOnBookingRequested}, qui exclut le client.
 *
 * « Au nom du client » : {@see Booking::recordedOnBehalf()}, la définition que la
 * ressource sert aussi (`recorded_by_staff`). Une demande du client pour lui-même (tunnel public,
 * voie du client) n'en est jamais une.
 */
class NotifyCustomerOfBookingRecordedOnBehalf
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(BookingRequested $event): void
    {
        $booking = $event->booking;
        $booking->loadMissing(['customer.user', 'property']);

        if ($booking->recordedOnBehalf() !== true || $booking->customer === null) {
            return;
        }

        $code = NotificationCode::BookingRecordedOnBehalf;
        $params = BookingNotificationParams::for($booking, $code);
        $target = BookingNotificationParams::target($booking);
        $customer = $booking->customer;
        $agencyId = $booking->agency_id !== null ? (int) $booking->agency_id : null;

        try {
            if ($customer->user !== null) {
                $this->notifications->send($customer->user, $code, $params, $target, agencyId: $agencyId);
                $relais = ContactSansCompte::relaisMobileDuCompte($customer->user, ContactSansCompte::fromCustomer($customer));
                if ($relais !== null) {
                    $this->notifications->send($relais, $code, $params, null, agencyId: $agencyId);
                }
            } elseif (($contact = ContactSansCompte::fromCustomer($customer))->hasPhone()) {
                $this->notifications->send($contact, $code, $params, null, agencyId: $agencyId);
            } else {
                Log::info('[booking] avis au client non envoyé — fiche sans compte ni téléphone valide', [
                    'booking_id' => $booking->id,
                ]);
            }
        } catch (\Throwable $e) {
            // Un échec d'envoi ne casse jamais la création (comme `VisitNotifier`) : il est journalisé.
            Log::warning('[booking] avis au client en échec', [
                'booking_id' => $booking->id,
                'code' => $code->value,
            ] + SafeExceptionContext::of($e));
        }
    }
}
