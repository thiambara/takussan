<?php

namespace App\Services\Model;

use App\Domain\Notifications\NotificationCode;
use App\Events\Booking\BookingClosed;
use App\Events\Booking\BookingRequested;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingNotificationParams;
use App\Services\Booking\BookingQuote;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BookingService
{
    public function __construct(
        protected NotificationService $notifications,
        protected BookingQuote $quotes,
        protected CustomerService $customers,
    ) {}

    /** @var array<int,PropertyStatus> */
    protected const UNBOOKABLE_STATUSES = [
        PropertyStatus::Sold,
        PropertyStatus::Rented,
        PropertyStatus::Draft,
        PropertyStatus::Archived,
        PropertyStatus::UnderMaintenance,
        PropertyStatus::Unavailable,
    ];

    /** @var array<int,BookingStatus> */
    protected const TERMINAL_CANCEL_STATUSES = [
        BookingStatus::Cancelled,
        BookingStatus::Completed,
        BookingStatus::Expired,
        BookingStatus::Rejected,
    ];

    /**
     * Validate that the property is bookable, the acting user is allowed,
     * then create the booking.
     *
     * @param  array<string,mixed>  $data
     */
    public function create(Property $property, User $user, array $data): Booking
    {
        abort_code_if(
            in_array($property->status, self::UNBOOKABLE_STATUSES, true),
            422,
            'booking.property_unavailable'
        );

        // Owners cannot book their own property (admins can still act on their behalf).
        abort_code_if(
            $property->user_id === $user->id && ! $user->isSuperAdmin(),
            403,
            'booking.own_property'
        );

        // TCK-587 (ADR-0031) — le PERSONNEL de l'agence du bien. La clause « même agence » valait
        // pour un autre bailleur de l'agence : il réservait un bien privé ou non publié, sans
        // client. Il suit désormais le chemin du client. Le disjoint `$property->user_id ===
        // $user->id` était mort : le propriétaire est refusé plus haut.
        $isStaff = $user->isSuperAdmin()
            || ($property->agency_id !== null && $user->staffAgencyId() === (int) $property->agency_id);

        if (! $isStaff) {
            abort_code_unless(
                Property::query()->where('id', $property->id)->public()->exists(),
                403,
                'booking.property_unavailable'
            );
        }

        $isBookingForSelf = false;
        if (! empty($data['customer_id'])) {
            $customer = Customer::find($data['customer_id']);
            $isBookingForSelf = $customer && $customer->user_id === $user->id;
            // Vérification adverse de TCK-530 — `$isStaff` laissait un membre de l'agence du bien
            // réserver au nom de N'IMPORTE QUEL client, y compris celui d'une autre agence. Le
            // client doit être dans le périmètre de l'émetteur (`CustomerPolicy::view` : agence
            // active, client qu'il a ajouté, super-admin), ou être l'émetteur lui-même.
            abort_unless($isBookingForSelf || ($customer && $user->can('view', $customer)), 403);
        } elseif (! $isStaff) {
            // TCK-530 — le tunnel public n'envoie pas de `customer_id` : sans cette résolution,
            // un client ne pouvait JAMAIS réserver par lui (403). Même geste que
            // `PublicPropertyController::bookingRequest()`.
            $data['customer_id'] = $this->customers->findOrCreateFromUser($user)->id;
            $isBookingForSelf = true;
        }

        abort_unless($isStaff || $isBookingForSelf, 403);

        // Montants ET devise viennent du bien : la devise n'est plus le défaut XOF (TCK-530).
        $data = array_merge($data, $this->pricedAmounts($property, $data));

        $booking = Booking::create(array_merge($data, [
            'reference_number' => ReferenceNumberGenerator::booking(),
            'created_by_id' => $user->id,
            'agency_id' => $property->agency_id,
            'status' => BookingStatus::Pending->value,
            'expires_at' => $data['expires_at'] ?? now()->addDays(7),
        ]));

        // TCK-596 — prévenir qui doit traiter la demande (bailleur, personnel, agent du bien) est
        // le rôle de `NotifyOnBookingRequested`, partagé avec la demande publique : ici, le seul
        // bailleur l'était, et jamais l'agent du bien.
        BookingRequested::dispatch($booking, $user->id);

        return $booking;
    }

    /**
     * TCK-530 — le montant est celui du SERVEUR ; un montant client qui en diffère est refusé
     * (422), jamais remplacé en silence : celui qui l'envoie croit réserver à ce prix-là, et
     * l'enregistrer à un autre serait un engagement qu'il n'a pas vu. Le tunnel n'envoie aucun
     * montant — il n'est donc jamais concerné par ce refus.
     *
     * Même règle pour `currency` : les montants sont calculés dans la devise du bien, une autre
     * devise envoyée est refusée.
     *
     * @param  array<string,mixed>  $data
     * @return array{total_amount: string, deposit_amount: string, currency: string}
     */
    protected function pricedAmounts(Property $property, array $data): array
    {
        $quote = $this->quotes->for(
            $property,
            isset($data['start_date']) ? Carbon::parse($data['start_date']) : null,
            isset($data['end_date']) ? Carbon::parse($data['end_date']) : null,
        );

        $mismatched = [];
        foreach (['total_amount', 'deposit_amount'] as $field) {
            if (isset($data[$field]) && ! BookingQuote::sameAmount((string) $data[$field], $quote[$field])) {
                $mismatched[$field] = [__('bookings.'.BookingQuote::CODE_AMOUNT_MISMATCH)];
            }
        }
        if (isset($data['currency']) && $data['currency'] !== $quote['currency']->value) {
            $mismatched['currency'] = [__('bookings.'.BookingQuote::CODE_CURRENCY_MISMATCH)];
        }
        if ($mismatched !== []) {
            throw ValidationException::withMessages($mismatched);
        }

        return ['currency' => $quote['currency']->value] + $quote;
    }

    public function confirm(Booking $booking): Booking
    {
        abort_code_unless(
            $booking->status === BookingStatus::Pending,
            422,
            'booking.not_pending_confirm'
        );

        // Serialize confirmations on the same property: without a lock two
        // concurrent confirmations of overlapping ranges can both pass the
        // existence check and both commit Confirmed → a double-booking. We take
        // a row lock on the parent property so confirmations queue, then
        // re-assert state under the lock.
        $booking = DB::transaction(function () use ($booking) {
            Property::query()->whereKey($booking->property_id)->lockForUpdate()->first();

            $booking->refresh();
            abort_code_unless(
                $booking->status === BookingStatus::Pending,
                422,
                'booking.not_pending_confirm'
            );

            $this->assertNoOverlap($booking);

            $booking->update([
                'status' => BookingStatus::Confirmed,
                'confirmed_at' => now(),
            ]);

            return $booking->refresh();
        });

        $customer = $booking->customer?->user;
        if ($customer) {
            $this->notifyBooking($customer, NotificationCode::BookingConfirmed, $booking);
        }

        return $booking;
    }

    public function reject(Booking $booking, ?string $reason = null, ?User $by = null): Booking
    {
        abort_code_unless(
            $booking->status === BookingStatus::Pending,
            422,
            'booking.not_pending_reject'
        );

        $booking->update([
            'status' => BookingStatus::Rejected,
            'cancelled_at' => now(),
            'cancellation_reason' => $reason,
        ]);

        $booking->refresh();

        $customer = $booking->customer?->user;
        if ($customer) {
            $this->notifyBooking($customer, NotificationCode::BookingRejected, $booking);
        }

        // TCK-596 — un acompte encaissé sur une demande refusée devient une tâche.
        BookingClosed::dispatch($booking, BookingClosed::REASON_REJECTED, $by?->id);

        return $booking;
    }

    /**
     * Reject the confirmation if another confirmed booking already
     * overlaps the target booking's date range on the same property.
     * Bookings without dates are skipped (open-ended reservations).
     */
    protected function assertNoOverlap(Booking $booking): void
    {
        if (! $booking->start_date || ! $booking->end_date) {
            return;
        }

        $overlap = Booking::query()
            ->where('property_id', $booking->property_id)
            ->where('id', '!=', $booking->id)
            ->where('status', BookingStatus::Confirmed)
            ->whereNotNull('start_date')
            ->whereNotNull('end_date')
            ->where(function ($q) use ($booking) {
                $q->where('start_date', '<=', $booking->end_date)
                    ->where('end_date', '>=', $booking->start_date);
            })
            ->exists();

        abort_code_if(
            $overlap,
            422,
            'booking.dates_overlap'
        );
    }

    public function cancel(Booking $booking, User $user, ?string $reason = null): Booking
    {
        abort_code_if(
            in_array($booking->status, self::TERMINAL_CANCEL_STATUSES, true),
            422,
            'booking.cannot_cancel'
        );

        $property = $booking->property;
        if ($user->id === $booking->customer?->user_id) {
            $by = CancellationBy::Customer;
        } elseif ($property && $property->user_id === $user->id) {
            $by = CancellationBy::Owner;
        } else {
            $by = CancellationBy::Agent;
        }

        $booking->update([
            'status' => BookingStatus::Cancelled,
            'cancelled_at' => now(),
            'cancellation_by' => $by,
            'cancellation_reason' => $reason,
        ]);

        $booking->refresh();

        // TCK-596 — l'annulation prévient toutes les parties prenantes MOINS son auteur
        // (`NotifyOnBookingCancelled`), et un acompte encaissé ouvre une tâche
        // (`OpenBookingRefundTask`). Seul le client était prévenu, même quand il annulait lui-même.
        BookingClosed::dispatch($booking, BookingClosed::REASON_CANCELLED, $user->id);

        return $booking;
    }

    /** TCK-588 (ADR-0032) — une notification de réservation, rendue dans la langue de son destinataire. */
    private function notifyBooking(User $to, NotificationCode $code, Booking $booking): void
    {
        $this->notifications->send($to, $code, BookingNotificationParams::for($booking, $code), BookingNotificationParams::target($booking));
    }
}
