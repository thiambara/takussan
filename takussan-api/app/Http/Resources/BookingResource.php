<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Booking;
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
            'total_amount' => (float) $this->total_amount,
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
