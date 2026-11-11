<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentStatus;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Http\Request;

class BookingResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference_number' => $this->reference_number,
            'property_id' => $this->property_id,
            'customer_id' => $this->customer_id,
            'agency_id' => $this->agency_id,
            'status' => $this->status?->value,
            // TCK-2579 (ADR-0102) — la nature, et ce qu'une offre ou une candidature retient du bien.
            // Omises sous un sparse fieldset qui ne les lit pas ; nulles sur un modèle qui vient d'être
            // créé sans elles (même exception que `responseDeadline()`), comme le `show` les rend.
            'kind' => $this->when($this->lue('kind'), fn (): ?string => $this->kind?->value),
            'offer_expires_at' => $this->when($this->lue('offer_expires_at'), fn (): ?string => $this->calendarDate($this->offer_expires_at)),
            'list_price_at_booking' => $this->when($this->lue('list_price_at_booking'), fn (): ?float => $this->list_price_at_booking !== null ? (float) $this->list_price_at_booking : null),
            // TCK-2579 — qui l'a saisie (le nom seul, jamais une coordonnée) et si c'était pour le
            // client ; seulement quand l'auteur, ou le client, est chargé : jamais une requête par ligne.
            'created_by' => $this->when($this->authorLoaded(), fn (): ?array => $this->createdBy === null ? null : [
                'id' => $this->createdBy->id,
                'name' => $this->createdBy->nameWithoutContact(),
            ]),
            'recorded_by_staff' => $this->when(($recordedByStaff = $this->recordedByStaff()) !== null, fn (): ?bool => $recordedByStaff),
            // TCK-1182 (P100.03) — `whenHas` : sous un sparse fieldset qui ne lit pas la colonne, la clé
            // est omise au lieu d'une valeur inventée (montant à 0, nature ou devise par défaut).
            'total_amount' => $this->whenHas('total_amount', fn () => (float) $this->total_amount),
            'deposit_amount' => $this->deposit_amount !== null ? (float) $this->deposit_amount : null,
            'currency' => $this->currency?->value,
            'start_date' => $this->calendarDate($this->start_date),
            'end_date' => $this->calendarDate($this->end_date),
            'confirmed_at' => $this->iso($this->confirmed_at),
            'cancelled_at' => $this->iso($this->cancelled_at),
            'expires_at' => $this->iso($this->expires_at),
            // TCK-575 — l'échéance RÉELLE d'une demande en attente (seuil de l'agence ou
            // `expires_at`, la première échue) ; `null` quand rien ne la fera expirer.
            'response_deadline' => $this->iso($this->responseDeadline()),
            'cancellation_by' => $this->cancellation_by?->value,
            'cancellation_reason' => $this->cancellation_reason,
            // TCK-596 — dérivé des paiements, et seulement quand ils sont chargés : jamais une
            // requête par ligne d'une liste.
            'refund_status' => $this->whenLoaded('payments', fn (): ?string => $this->refundStatus()),
            // TCK-596 — le détail les attendait (`booking_payments`) et ne les recevait jamais : la
            // liste des paiements restait vide, et rien ne désignait l'acompte à rembourser.
            'booking_payments' => $this->whenLoaded('payments', fn (): array => BookingPaymentResource::collection($this->payments)->toArray($request)),
            'notes' => $this->notes,
            'property' => $this->whenLoaded('property', fn () => PropertyResource::make($this->property)),
            'customer' => $this->whenLoaded('customer', fn () => CustomerResource::make($this->customer)),
            'created_at' => $this->iso($this->created_at),
        ];
    }

    /**
     * Les colonnes dont `response_deadline` dépend. Une lecture en sparse fieldset qui veut
     * l'échéance les demande toutes (`fields[bookings]=…`) : chacune est un champ permis de
     * `Booking::$queryFields`, ce que `BookingResponseDeadlineTest` vérifie par une vraie requête.
     *
     * @var list<string>
     */
    public const CHAMPS_DE_L_ECHEANCE = ['status', 'agency_id', 'created_at', 'expires_at', 'expired_at'];

    /**
     * Calculée seulement quand le modèle porte les colonnes dont elle dépend : sous un sparse
     * fieldset qui les omet, `agency_id` ou `created_at` absents la feraient retomber en silence
     * sur `expires_at` seul — 7 jours au lieu du seuil de l'agence. Mieux vaut `null` qu'une
     * échéance fausse.
     *
     * Un modèle QUI VIENT D'ÊTRE CRÉÉ est l'exception : ses attributs sont ceux qu'on a écrits, et
     * une colonne absente y vaut réellement `null` en base (la demande publique ne pose pas
     * `expires_at`) — elle n'a pas été omise par une sélection.
     */
    /**
     * TCK-596 — `pending` : réservation fermée sans avoir eu lieu, au moins un paiement encore
     * `paid` ; `refunded` : plus aucun `paid`, au moins un `refunded` ; `null` sinon.
     */
    private function refundStatus(): ?string
    {
        if (! in_array($this->status, [BookingStatus::Cancelled, BookingStatus::Rejected, BookingStatus::Expired], true)) {
            return null;
        }

        $statuses = $this->payments->map(static fn ($p) => $p->status);

        return match (true) {
            $statuses->contains(PaymentStatus::Paid) => 'pending',
            $statuses->contains(PaymentStatus::Refunded) => 'refunded',
            default => null,
        };
    }

    /** TCK-2579 — la colonne a été lue, ou le modèle vient d'être créé (une colonne absente y vaut `null` en base). */
    private function lue(string $colonne): bool
    {
        return $this->resource instanceof Booking
            && ($this->resource->wasRecentlyCreated || array_key_exists($colonne, $this->resource->getAttributes()));
    }

    /** TCK-2579 — l'auteur chargé ET sa colonne lue : sinon `null` dirait « sans auteur » à tort. */
    private function authorLoaded(): bool
    {
        return $this->resource instanceof Booking
            && $this->resource->relationLoaded('createdBy')
            && array_key_exists('created_by_id', $this->resource->getAttributes());
    }

    /**
     * TCK-2579 — {@see Booking::recordedOnBehalf()}, seulement quand le modèle porte les deux
     * colonnes qu'elle lit et son client : sous un sparse fieldset qui les omet, `false` serait
     * une valeur inventée.
     */
    private function recordedByStaff(): ?bool
    {
        $booking = $this->resource;
        if (! $booking instanceof Booking
            || ! array_key_exists('customer_id', $booking->getAttributes())
            || ! array_key_exists('created_by_id', $booking->getAttributes())) {
            return null;
        }

        return $booking->recordedOnBehalf();
    }

    private function responseDeadline(): ?\DateTimeInterface
    {
        $booking = $this->resource;
        if (! $booking instanceof Booking) {
            return null;
        }
        if (! $booking->wasRecentlyCreated) {
            foreach (self::CHAMPS_DE_L_ECHEANCE as $colonne) {
                if (! array_key_exists($colonne, $booking->getAttributes())) {
                    return null;
                }
            }
        }

        return app(BookingExpirationService::class)->responseDeadline($booking);
    }
}
