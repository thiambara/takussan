<?php

namespace App\Services\Booking;

use App\Domain\Notifications\NotificationCode;
use App\Models\Booking;
use App\Models\BookingCounterOffer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CounterOfferStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Model\BookingService;
use App\Services\Model\NotificationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2873 (ADR-0110 § 5) — la contre-offre de l'agence sur une offre d'achat en attente.
 *
 * - `propose` : seulement sur une offre (`kind = offer`) `pending` (422 `booking.counter_offer_not_allowed`
 *   sinon) ; la contre-offre encore `pending` passe `superseded` ; le client est prévenu
 *   (`booking.counter_offer_received`) ;
 * - `accept` : par le client, sur une contre-offre `pending` non échue d'une offre encore en attente
 *   (422 `booking.counter_offer_expired` / `booking.counter_offer_not_open` sinon) ; l'offre prend son
 *   montant et passe `confirmed` PAR {@see BookingService::confirm()} — mêmes effets qu'une acceptation
 *   de l'agence ;
 * - `decline` : par le client ; l'offre reste `pending` à son montant d'origine ;
 * - `expire` : par la tâche d'expiration des réservations (`BookingExpirationService::expireCounterOffers`),
 *   sans toucher à l'offre.
 *
 * L'agence est prévenue des deux réponses (`booking.counter_offer_answered`, paramètre `answer`).
 * Le statut de la réservation ne change pas pendant la contre-offre : « en attente du client » est
 * dérivé (`BookingResource::awaiting`). Chaque geste entre au journal de la réservation.
 */
class BookingCounterOfferService
{
    /** Les événements du journal de la réservation (sujet : la réservation). */
    public const EVENT_PROPOSED = 'counter_offer_proposed';

    public const EVENT_ACCEPTED = 'counter_offer_accepted';

    public const EVENT_DECLINED = 'counter_offer_declined';

    public const EVENT_EXPIRED = 'counter_offer_expired';

    /** La validité par défaut, et la plus longue, en jours (ADR-0110 § 5, ticket TCK-2873). */
    public const DEFAULT_VALIDITY_DAYS = 3;

    public const MAX_VALIDITY_DAYS = 30;

    public function __construct(
        private readonly BookingService $bookings,
        private readonly NotificationService $notifications,
    ) {}

    /** Le jour courant à Dakar : les bornes de `valid_until` s'y jugent (`FinInclusive`). */
    public static function today(): Carbon
    {
        return now('Africa/Dakar')->startOfDay();
    }

    /**
     * @param  array{amount: int|string, message?: ?string, valid_until?: ?string}  $data
     */
    public function propose(Booking $booking, array $data, User $by): BookingCounterOffer
    {
        $counterOffer = DB::transaction(function () use ($booking, $data, $by): BookingCounterOffer {
            /** @var Booking $locked */
            $locked = Booking::query()->whereKey($booking->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless(
                $locked->kind === BookingKind::Offer && $locked->status === BookingStatus::Pending,
                422,
                'booking.counter_offer_not_allowed',
            );

            BookingCounterOffer::query()
                ->where('booking_id', $locked->id)
                ->where('status', CounterOfferStatus::Pending->value)
                ->update(['status' => CounterOfferStatus::Superseded->value, 'updated_at' => now()]);

            $counterOffer = BookingCounterOffer::create([
                'booking_id' => $locked->id,
                'amount' => (string) $data['amount'],
                'message' => isset($data['message']) && $data['message'] !== '' ? $data['message'] : null,
                'valid_until' => $data['valid_until'] ?? self::today()->addDays(self::DEFAULT_VALIDITY_DAYS)->toDateString(),
                'created_by_id' => $by->id,
                'status' => CounterOfferStatus::Pending->value,
            ]);

            $this->journal($locked, self::EVENT_PROPOSED, $counterOffer, $by);

            return $counterOffer;
        });

        $customer = $booking->customer?->user;
        if ($customer !== null) {
            $this->notifications->send(
                $customer,
                NotificationCode::BookingCounterOfferReceived,
                $this->params($booking, $counterOffer),
                BookingNotificationParams::target($booking),
            );
        }

        return $counterOffer;
    }

    public function accept(Booking $booking, BookingCounterOffer $counterOffer, User $by): Booking
    {
        $booking = DB::transaction(function () use ($booking, $counterOffer, $by): Booking {
            // L'ordre de `BookingService::confirm()` : le bien, puis la réservation.
            Property::query()->whereKey($booking->property_id)->lockForUpdate()->first();
            /** @var Booking $locked */
            $locked = Booking::query()->whereKey($booking->getKey())->lockForUpdate()->firstOrFail();
            $offre = $this->lockOpen($locked, $counterOffer);

            $offre->update(['status' => CounterOfferStatus::Accepted->value, 'responded_at' => now()]);
            $locked->update(['total_amount' => (string) $offre->amount]);
            $this->journal($locked, self::EVENT_ACCEPTED, $offre, $by);

            // Le chemin d'acceptation de l'agence : mêmes gardes, même avis au client.
            return $this->bookings->confirm($locked);
        });

        $this->notifyAgency($booking, $counterOffer->refresh(), 'accepted');

        return $booking;
    }

    public function decline(Booking $booking, BookingCounterOffer $counterOffer, User $by): Booking
    {
        DB::transaction(function () use ($booking, $counterOffer, $by): void {
            /** @var Booking $locked */
            $locked = Booking::query()->whereKey($booking->getKey())->lockForUpdate()->firstOrFail();
            $offre = $this->lockOpen($locked, $counterOffer);

            $offre->update(['status' => CounterOfferStatus::Declined->value, 'responded_at' => now()]);
            $this->journal($locked, self::EVENT_DECLINED, $offre, $by);
        });

        $this->notifyAgency($booking, $counterOffer->refresh(), 'declined');

        return $booking->refresh();
    }

    /**
     * Passe `expired` une contre-offre encore `pending` dont la validité est passée. Rend `false`
     * si elle a changé d'état entre-temps (relue sous verrou). L'offre n'est pas touchée.
     */
    public function expire(BookingCounterOffer $counterOffer): bool
    {
        return DB::transaction(function () use ($counterOffer): bool {
            /** @var BookingCounterOffer|null $locked */
            $locked = BookingCounterOffer::query()->whereKey($counterOffer->getKey())->lockForUpdate()->first();
            if ($locked === null || $locked->status !== CounterOfferStatus::Pending || ! $locked->isOverdue()) {
                return false;
            }

            $locked->update(['status' => CounterOfferStatus::Expired->value]);
            if ($locked->booking !== null) {
                $this->journal($locked->booking, self::EVENT_EXPIRED, $locked, null);
            }

            return true;
        });
    }

    /** La contre-offre relue sous verrou, ouverte, sur une offre encore en attente. */
    private function lockOpen(Booking $locked, BookingCounterOffer $counterOffer): BookingCounterOffer
    {
        /** @var BookingCounterOffer $offre */
        $offre = BookingCounterOffer::query()
            ->whereKey($counterOffer->getKey())
            ->where('booking_id', $locked->id)
            ->lockForUpdate()
            ->firstOrFail();

        abort_code_if(
            $offre->status === CounterOfferStatus::Expired
                || ($offre->status === CounterOfferStatus::Pending && $offre->isOverdue()),
            422,
            'booking.counter_offer_expired',
        );
        abort_code_unless(
            $offre->status === CounterOfferStatus::Pending && $locked->status === BookingStatus::Pending,
            422,
            'booking.counter_offer_not_open',
        );

        return $offre;
    }

    private function notifyAgency(Booking $booking, BookingCounterOffer $counterOffer, string $answer): void
    {
        $customerUserId = $booking->customer?->user_id;
        $team = app(BookingStakeholders::class)->for($booking)
            ->reject(fn (User $user) => $customerUserId !== null && (int) $user->id === (int) $customerUserId);
        // L'auteur de la contre-offre, s'il n'est pas déjà de l'équipe de la réservation.
        $author = $counterOffer->createdBy;
        if ($author !== null && (int) $author->id !== (int) $customerUserId && ! $team->contains('id', $author->id)) {
            $team->push($author);
        }

        $params = $this->params($booking, $counterOffer) + ['answer' => $answer];
        foreach ($team as $member) {
            $this->notifications->send(
                $member,
                NotificationCode::BookingCounterOfferAnswered,
                array_intersect_key($params, NotificationCode::BookingCounterOfferAnswered->params()),
                BookingNotificationParams::target($booking),
            );
        }
    }

    /** @return array<string, mixed> */
    private function params(Booking $booking, BookingCounterOffer $counterOffer): array
    {
        $booking->loadMissing('property');

        return [
            'reference' => $booking->reference_number ?? (string) $booking->id,
            'property' => $booking->property?->title,
            'amount' => ['amount' => (string) $counterOffer->amount, 'currency' => $booking->currency?->value],
            'valid_until' => $counterOffer->valid_until?->toDateString(),
        ];
    }

    private function journal(Booking $booking, string $event, BookingCounterOffer $counterOffer, ?User $by): void
    {
        activity('Booking')
            ->performedOn($booking)
            ->causedBy($by)
            ->withProperties([
                'counter_offer_id' => $counterOffer->id,
                'amount' => (string) $counterOffer->amount,
                'valid_until' => $counterOffer->valid_until?->toDateString(),
            ])
            ->event($event)
            ->log($event);
    }
}
