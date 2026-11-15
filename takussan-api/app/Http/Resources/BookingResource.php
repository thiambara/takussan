<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentStatus;
use App\Services\Booking\BookingConditions;
use App\Services\Booking\BookingCustomerFacts;
use App\Services\Booking\BookingDossierService;
use App\Services\Booking\BookingExpirationService;
use App\Services\Booking\BookingGuarantorFacts;
use Illuminate\Http\Request;

class BookingResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        $visites = $this->resource instanceof Booking ? BookingCustomerFacts::visitsOnProperty($request, $this->resource) : null;
        // TCK-2870 — au seul personnel, préparés pour la page par `BookingCustomerFacts::prime`.
        [$derniereServie, $derniere] = $this->resource instanceof Booking ? BookingCustomerFacts::lastVisitOnProperty($request, $this->resource) : [false, null];
        $faits = $this->resource instanceof Booking ? BookingCustomerFacts::propertyFacts($request, $this->resource) : null;
        // TCK-2872 — la complétude du dossier, préparée pour la page par `BookingDossierService::prime`.
        [$dossierServi, $dossier] = $this->resource instanceof Booking ? BookingDossierService::summaryFor($request, $this->resource) : [false, null];
        // TCK-2893 — garants et revenus, au seul personnel, préparés par `BookingGuarantorFacts::prime`.
        $garants = $this->resource instanceof Booking ? BookingGuarantorFacts::for($request, $this->resource) : null;

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
            // TCK-2593 — le téléphone et l'étape de la fiche ne sortent que vers le personnel de
            // l'agence ({@see BookingCustomerFacts}) ; le client ne lit plus ni l'un ni l'autre.
            'customer' => $this->whenLoaded('customer', fn (): ?array => $this->customerCard($request)),
            // TCK-2593 — les visites terminées de ce client sur ce bien, au seul personnel, en une
            // requête pour la page (`BookingCustomerFacts::prime`) ; omise sinon.
            'visits_on_property' => $this->when($visites !== null, $visites),
            // TCK-2870 — la dernière de ces visites : sa date et le verdict de son compte rendu
            // (ADR-0101 § 3), `null` sans visite ; mêmes lecteurs que `visits_on_property`, qui reste
            // un nombre (le front le lit comme tel).
            'last_visit_on_property' => $this->when($derniereServie, fn (): ?array => $derniere === null ? null : [
                'scheduled_at' => $this->iso($derniere['scheduled_at']),
                'report_verdict' => $derniere['report_verdict'],
            ]),
            // TCK-2870 (ADR-0110, maquette e4) — ce que le bien dit autour de la réservation, au seul
            // personnel de l'agence ; `offer_rank` pour une offre seule.
            'other_pending_on_property' => $this->when($faits !== null, fn (): int => $faits['other_pending_on_property']),
            'property_visits_count' => $this->when($faits !== null, fn (): int => $faits['property_visits_count']),
            'offer_rank' => $this->when(($faits['offer_rank'] ?? null) !== null, fn (): ?int => $faits['offer_rank']),
            // TCK-2870 (ADR-0110 § 1) — les conditions : durée et renouvellement, instantané de la
            // caution, de l'avance et des frais (candidature) ; financement, délai, conditions (offre).
            // Nulles pour une nature qui ne les écrit pas ; omises sous un sparse fieldset qui ne les lit pas.
            'term_months' => $this->when($this->lue('term_months'), fn (): ?int => $this->term_months),
            'renewable' => $this->when($this->lue('renewable'), fn (): ?bool => $this->renewable),
            'security_deposit_months' => $this->when($this->lue('security_deposit_months'), fn (): ?int => $this->security_deposit_months),
            'security_deposit_amount' => $this->when($this->lue('security_deposit_amount'), fn (): ?float => $this->security_deposit_amount !== null ? (float) $this->security_deposit_amount : null),
            'advance_months_at_booking' => $this->when($this->lue('advance_months_at_booking'), fn (): ?int => $this->advance_months_at_booking),
            'agency_fee_months_at_booking' => $this->when($this->lue('agency_fee_months_at_booking'), fn (): ?float => $this->agency_fee_months_at_booking !== null ? (float) $this->agency_fee_months_at_booking : null),
            'financing' => $this->when($this->lue('financing'), fn (): ?string => $this->financing?->value),
            'signature_within_days' => $this->when($this->lue('signature_within_days'), fn (): ?int => $this->signature_within_days),
            'conditions' => $this->when($this->lue('conditions'), fn (): ?string => $this->conditions),
            // « À verser à l'entrée », DÉRIVÉ, jamais écrit (`BookingConditions::entryAmount`) : seulement
            // quand toutes les colonnes qu'il lit sont lues — sinon un montant faux plutôt qu'absent.
            'entry_amount' => $this->when($this->toutesLues(BookingConditions::ENTRY_AMOUNT_COLUMNS), fn (): ?float => ($montant = BookingConditions::entryAmount($this->resource)) !== null ? (float) $montant : null),
            // TCK-2872 (ADR-0110 § 2) — `{ received, required, missing }`, `null` pour un séjour (sans
            // dossier) ; servi à qui lit la réservation (le client, le personnel de l'agence du bien, le
            // bailleur — les lecteurs des pièces, ADR-0099), seulement quand la page l'a préparé.
            'dossier' => $this->when($dossierServi, fn (): ?array => $dossier),
            // TCK-2893 (ADR-0110 § 3 et 4) — au SEUL personnel de l'agence du bien : le garant (nom,
            // lien), le revenu déclaré MASQUÉ et son rapport au loyer, arrondi au dixième. Le montant
            // ne sort jamais en clair ici (lecture dédiée : `GET /api/bookings/{booking}/sensitive`).
            'has_guarantor' => $this->when($garants !== null, fn (): bool => $garants['has_guarantor']),
            'guarantors' => $this->when($garants !== null, fn (): array => $garants['guarantors']),
            'declared_monthly_income_masked' => $this->when($garants !== null, fn (): ?string => $garants['declared_monthly_income_masked']),
            'income_to_rent_ratio' => $this->when($garants !== null, fn (): ?float => $garants['income_to_rent_ratio']),
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

    /**
     * TCK-2593 — la fiche client imbriquée, sans `phone` ni `pipeline_stage` pour qui n'est pas
     * du personnel de l'agence de la réservation.
     *
     * @return array<string, mixed>|null
     */
    private function customerCard(Request $request): ?array
    {
        if ($this->customer === null) {
            return null;
        }
        $fiche = CustomerResource::make($this->customer)->resolve($request);
        if (BookingCustomerFacts::masksCustomerCard($request, $this->resource)) {
            unset($fiche['phone'], $fiche['pipeline_stage']);
        }

        return $fiche;
    }

    /** TCK-2579 — la colonne a été lue, ou le modèle vient d'être créé (une colonne absente y vaut `null` en base). */
    private function lue(string $colonne): bool
    {
        return $this->resource instanceof Booking
            && ($this->resource->wasRecentlyCreated || array_key_exists($colonne, $this->resource->getAttributes()));
    }

    /**
     * TCK-2870 — toutes ces colonnes ont été lues (ou le modèle vient d'être créé).
     *
     * @param  list<string>  $colonnes
     */
    private function toutesLues(array $colonnes): bool
    {
        foreach ($colonnes as $colonne) {
            if (! $this->lue($colonne)) {
                return false;
            }
        }

        return true;
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
