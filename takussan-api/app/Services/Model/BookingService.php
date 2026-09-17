<?php

namespace App\Services\Model;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Enums\NotificationType;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
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
        abort_if(
            in_array($property->status, self::UNBOOKABLE_STATUSES, true),
            422,
            'This property is not available for booking.'
        );

        // Owners cannot book their own property (admins can still act on their behalf).
        abort_if(
            $property->user_id === $user->id && ! $user->isSuperAdmin(),
            403,
            'You cannot book your own property.'
        );

        $isStaff = $user->isSuperAdmin()
            || ($user->agency_id && $property->agency_id && $user->agency_id === $property->agency_id)
            || $property->user_id === $user->id;

        if (! $isStaff) {
            abort_unless(
                Property::query()->where('id', $property->id)->public()->exists(),
                403,
                'This property is not available for booking.'
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

        // Notify the landlord (property owner)
        $recipients = collect();
        $owner = $property->owner;
        if ($owner) {
            $recipients->push($owner);
        }

        $this->notifications->notifyMany(
            $recipients,
            NotificationType::Booking,
            'Nouvelle réservation',
            'Une réservation a été créée pour '.$property->title.'.',
            ['booking_id' => $booking->id],
            referenceableType: 'booking',
            referenceableId: $booking->id,
        );

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
        abort_unless(
            $booking->status === BookingStatus::Pending,
            422,
            'Only pending bookings can be confirmed.'
        );

        // Serialize confirmations on the same property: without a lock two
        // concurrent confirmations of overlapping ranges can both pass the
        // existence check and both commit Confirmed → a double-booking. We take
        // a row lock on the parent property so confirmations queue, then
        // re-assert state under the lock.
        $booking = DB::transaction(function () use ($booking) {
            Property::query()->whereKey($booking->property_id)->lockForUpdate()->first();

            $booking->refresh();
            abort_unless(
                $booking->status === BookingStatus::Pending,
                422,
                'Only pending bookings can be confirmed.'
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
            $this->notifications->notify(
                $customer,
                NotificationType::Booking,
                'Réservation confirmée',
                'Votre réservation '.$booking->reference_number.' a été confirmée.',
                ['booking_id' => $booking->id],
            );
        }

        return $booking;
    }

    public function reject(Booking $booking, ?string $reason = null): Booking
    {
        abort_unless(
            $booking->status === BookingStatus::Pending,
            422,
            'Only pending bookings can be rejected.'
        );

        $booking->update([
            'status' => BookingStatus::Rejected,
            'cancelled_at' => now(),
            'cancellation_reason' => $reason,
        ]);

        $booking->refresh();

        $customer = $booking->customer?->user;
        if ($customer) {
            $this->notifications->notify(
                $customer,
                NotificationType::Booking,
                'Réservation refusée',
                'Votre réservation '.$booking->reference_number.' a été refusée.',
                ['booking_id' => $booking->id],
            );
        }

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

        abort_if(
            $overlap,
            422,
            'Another confirmed booking already overlaps these dates on this property.'
        );
    }

    public function cancel(Booking $booking, User $user, ?string $reason = null): Booking
    {
        abort_if(
            in_array($booking->status, self::TERMINAL_CANCEL_STATUSES, true),
            422,
            'Booking cannot be cancelled in its current state.'
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

        $customer = $booking->customer?->user;
        if ($customer) {
            $this->notifications->notify(
                $customer,
                NotificationType::Booking,
                'Réservation annulée',
                'Votre réservation '.$booking->reference_number.' a été annulée.',
                ['booking_id' => $booking->id],
            );
        }

        return $booking;
    }
}
