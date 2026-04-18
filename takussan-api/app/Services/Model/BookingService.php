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
use App\Services\Model\NotificationService;
use Illuminate\Support\Collection;

class BookingService
{
    public function __construct(protected NotificationService $notifications) {}
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
            $property->user_id === $user->id && ! $user->hasRole(['admin', 'super_admin']),
            403,
            'You cannot book your own property.'
        );

        $isStaff = $user->hasRole(['admin', 'super_admin'])
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
        }

        abort_unless($isStaff || $isBookingForSelf, 403);

        $booking = Booking::create(array_merge($data, [
            'reference_number' => ReferenceNumberGenerator::booking(),
            'created_by_id' => $user->id,
            'agency_id' => $property->agency_id,
            'status' => BookingStatus::Pending->value,
            'currency' => $data['currency'] ?? 'XOF',
            'expires_at' => $data['expires_at'] ?? now()->addDays(7),
        ]));

        // Notify landlord and agency members
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

    public function confirm(Booking $booking): Booking
    {
        abort_unless(
            $booking->status === BookingStatus::Pending,
            422,
            'Only pending bookings can be confirmed.'
        );

        $booking->update([
            'status' => BookingStatus::Confirmed,
            'confirmed_at' => now(),
        ]);

        $booking->refresh();

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
