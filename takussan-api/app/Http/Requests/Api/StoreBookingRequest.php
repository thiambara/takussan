<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\ConvertitLesInstantsRecus;
use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\Currency;
use App\Models\Property;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de BookingController::store(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class StoreBookingRequest extends BaseFormRequest
{
    use ConvertitLesInstantsRecus;

    /**
     * La RÈGLE d'autorisation ne migre pas ici : elle appartient au contrôleur, au service puis aux
     * policies (principes non négociables 1 et 2, et TCK-306) ; seule son INVOCATION y vient quand
     * elle doit précéder la validation (TCK-2579). `BaseFormRequest` refuse par défaut —
     * *fail-closed* — donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        // TCK-2579 (ADR-0102 §2) — saisir une candidature ou une offre est un geste du PERSONNEL de
        // l'agence du bien, pour un client (`BookingPolicy::recordForCustomer`). Jugé ici, AVANT la
        // validation : un client ou un bailleur reçoit 403, jamais les règles d'un formulaire qui ne
        // lui est pas ouvert. Un bien absent ou illisible reçoit le même refus qu'un bien tiers
        // (TCK-1066). Sans `kind` ou en `stay`, la règle d'avant : le contrôleur et le service jugent.
        if (! in_array($this->input('kind'), self::KINDS_RECORDED_FOR_CUSTOMER, true)) {
            return true;
        }

        $propertyId = $this->input('property_id');
        $property = is_int($propertyId) || (is_string($propertyId) && ctype_digit($propertyId))
            ? Property::query()->find((int) $propertyId)
            : null;

        return $property !== null && $this->user()?->can('recordForCustomer', [Booking::class, $property]) === true;
    }

    /**
     * TCK-2579 — les natures que seul le personnel saisit par cette route : une candidature ou une
     * offre n'a ni devis ni nuits, son montant est celui du client.
     *
     * @var list<string>
     */
    public const KINDS_RECORDED_FOR_CUSTOMER = ['application', 'offer'];

    /**
     * TCK-2579 — plus grand montant que `decimal(14,2)` porte : au-delà, une offre rendrait 500.
     */
    public const MAX_AMOUNT = 999_999_999_999.99;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $kind = $this->input('kind');
        $recorded = in_array($kind, self::KINDS_RECORDED_FOR_CUSTOMER, true);

        return [
            // TCK-2579 (ADR-0102) — la nature saisie ; sans elle, celle du bien (`BookingKind`).
            'kind' => ['nullable', Rule::enum(BookingKind::class)],
            // TCK-2579 — la validité d'une offre, dernier jour inclus (heure de Dakar).
            'offer_expires_at' => [Rule::prohibitedIf($kind !== BookingKind::Offer->value), 'nullable', 'date', 'after_or_equal:today'],
            // TCK-1066 (P62.02) — plus de `exists:` : un 422 pour un identifiant absent contre un
            // 403 pour un client tiers ou un bien privé faisait de la création un ORACLE
            // d'existence. L'absence se juge dans le contrôleur et le service, avec la réponse du
            // refus (modèle de TCK-599, `StoreFavoriteRequest`).
            'property_id' => ['required', 'integer'],
            'customer_id' => ['nullable', 'integer'],
            // TCK-530 — facultatifs : le serveur calcule les deux (App\Services\Booking\BookingQuote)
            // et refuse un montant envoyé qui en diffère. `decimal:0,2` borne la forme que le
            // comparateur découpe sans flottant.
            // TCK-2579 — une offre DIT son montant (libre, > 0) ; une candidature peut proposer un
            // loyer (défaut : celui du bien). Aucune des deux ne porte d'acompte.
            'total_amount' => $recorded
                ? [Rule::requiredIf($kind === BookingKind::Offer->value), 'nullable', 'numeric', 'decimal:0,2', 'gt:0', 'max:'.self::MAX_AMOUNT]
                : ['nullable', 'numeric', 'decimal:0,2', 'min:0'],
            'deposit_amount' => [Rule::prohibitedIf($recorded), 'nullable', 'numeric', 'decimal:0,2', 'min:0'],
            'currency' => ['nullable', Rule::enum(Currency::class)],
            // Vérification adverse de TCK-530 — une arrivée passée était acceptée. Même règle que
            // `BookingRequestPublicPropertyRequest` ; `today` se juge dans le fuseau de l'appli (UTC,
            // l'heure de Dakar).
            // TCK-2579 — la date d'entrée d'une candidature est `start_date`, et elle est requise ;
            // une candidature n'a pas de départ, une offre n'a aucune date.
            'start_date' => [Rule::requiredIf($kind === BookingKind::Application->value), Rule::prohibitedIf($kind === BookingKind::Offer->value), 'nullable', 'date', 'after_or_equal:today'],
            'end_date' => [Rule::prohibitedIf($recorded), 'nullable', 'date', 'after_or_equal:start_date'],
            'notes' => ['nullable', 'string'],
            // TCK-1065 (P80.02) — le nombre que le tunnel exige (1 à 20, `booking.ts`) ; rangé dans
            // `metadata.guests` par `BookingService::create()`, comme la demande publique.
            'guests' => [Rule::prohibitedIf($recorded), 'sometimes', 'integer', 'min:1', 'max:20'],
            'expires_at' => ['nullable', 'date'],
        ];
    }

    /**
     * Les deux refus de dates dans la langue de l'appelant : `validation.php` ne porte ni
     * `after` ni `after_or_equal`, qui retombaient sur l'anglais de Laravel.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'start_date.after_or_equal' => __('bookings.start_in_past'),
            'end_date.after_or_equal' => __('bookings.end_before_start'),
        ];
    }

    /**
     * TCK-2743 — {@see ConvertitLesInstantsRecus}.
     * `offer_expires_at` n'est pas ici : il passe par `FinInclusive::de()`, qui garde la fin du jour
     * d'une date seule.
     */
    protected function instantsRecus(): array
    {
        return ['expires_at'];
    }
}
