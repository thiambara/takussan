<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Property;
use App\Services\Maintenance\CurrencyUnit;

/**
 * TCK-2870 (ADR-0110 § 1) — les conditions d'une candidature et d'une offre, écrites à la création
 * par les DEUX chemins qui créent une réservation (`BookingService::create`, saisie du personnel,
 * et `PublicPropertyController::bookingRequest`, tunnel public) — une seule définition ici.
 *
 * - **Une nature n'écrit que ses champs** : un champ d'une autre nature reçu en entrée est REFUSÉ
 *   (422 `booking.field_not_for_kind`), jamais ignoré en silence. Le refus lit les données
 *   validées : chaque champ de condition a sa règle dans LES DEUX requêtes (`StoreBookingRequest::
 *   conditionRules()`), quelle que soit la nature, et entre donc dans `validated()` — sans règle, il
 *   en serait retiré et passerait en silence. Une clé présente à `null` vaut une clé absente.
 * - **Instantané du bien** pour une candidature : mois de caution, d'avance et de frais du bien À
 *   LA CRÉATION ; caution = mois × montant de la candidature. Changer le bien ensuite ne change rien.
 * - **« À verser à l'entrée » n'est pas une colonne** : {@see self::entryAmount()}.
 */
final class BookingConditions
{
    /**
     * Les champs qu'une candidature reçoit en entrée. TCK-2893 (ADR-0110 § 4) — le revenu déclaré
     * du candidat en est : une offre ou un séjour qui l'envoie reçoit `booking.field_not_for_kind`.
     *
     * @var list<string>
     */
    public const APPLICATION_INPUT = ['term_months', 'renewable', 'declared_monthly_income'];

    /** @var list<string> les champs qu'une offre reçoit en entrée */
    public const OFFER_INPUT = ['financing', 'signature_within_days', 'conditions'];

    /** @var list<string> les colonnes de l'instantané : écrites par le serveur seul */
    public const APPLICATION_SNAPSHOT = ['security_deposit_months', 'security_deposit_amount', 'advance_months_at_booking', 'agency_fee_months_at_booking'];

    /** ADR-0110 § 1 — la durée proposée par défaut d'une candidature. */
    public const DEFAULT_TERM_MONTHS = 12;

    /** @return list<string> */
    public static function inputOf(BookingKind $kind): array
    {
        return match ($kind) {
            BookingKind::Application => self::APPLICATION_INPUT,
            BookingKind::Offer => self::OFFER_INPUT,
            BookingKind::Stay => [],
        };
    }

    /**
     * 422 `booking.field_not_for_kind` dès qu'un champ d'une AUTRE nature est envoyé (non nul).
     *
     * @param  array<string, mixed>  $input  le corps brut de la requête
     */
    public static function refuseForeignFields(BookingKind $kind, array $input): void
    {
        $etrangers = array_diff([...self::APPLICATION_INPUT, ...self::OFFER_INPUT], self::inputOf($kind));
        foreach ($etrangers as $champ) {
            abort_code_if(array_key_exists($champ, $input) && $input[$champ] !== null, 422, 'booking.field_not_for_kind');
        }
        // TCK-2893 (ADR-0110 § 3) — le garant facultatif : une candidature ou une offre, jamais un séjour.
        abort_code_if($kind === BookingKind::Stay && ! empty($input['guarantor']), 422, 'booking.field_not_for_kind');
    }

    /**
     * Les colonnes de conditions à écrire pour cette nature ; les autres restent nulles.
     *
     * @param  string  $amount  le montant de la candidature (`total_amount`, décimal en chaîne)
     * @param  array<string, mixed>  $input  les champs validés
     * @return array<string, mixed>
     */
    public static function columnsFor(BookingKind $kind, Property $property, string $amount, array $input): array
    {
        return match ($kind) {
            BookingKind::Application => [
                'term_months' => isset($input['term_months']) ? (int) $input['term_months'] : self::DEFAULT_TERM_MONTHS,
                'renewable' => isset($input['renewable']) ? (bool) filter_var($input['renewable'], FILTER_VALIDATE_BOOLEAN) : true,
                'security_deposit_months' => $property->deposit_months,
                'security_deposit_amount' => $property->deposit_months !== null
                    ? CurrencyUnit::round(bcmul($amount, (string) $property->deposit_months, 4), 2)
                    : null,
                'advance_months_at_booking' => $property->advance_months,
                'agency_fee_months_at_booking' => $property->agency_fee_months !== null ? (string) $property->agency_fee_months : null,
                // TCK-2893 — chiffré par le cast ; écrit en chaîne (jamais un flottant).
                'declared_monthly_income' => isset($input['declared_monthly_income']) ? (string) $input['declared_monthly_income'] : null,
            ],
            BookingKind::Offer => [
                'financing' => $input['financing'] ?? null,
                'signature_within_days' => isset($input['signature_within_days']) ? (int) $input['signature_within_days'] : null,
                'conditions' => $input['conditions'] ?? null,
            ],
            BookingKind::Stay => [],
        };
    }

    /** Les colonnes que {@see self::entryAmount()} lit : un sparse fieldset qui veut le montant les demande toutes. */
    public const ENTRY_AMOUNT_COLUMNS = ['kind', 'total_amount', 'term_months', 'security_deposit_amount', 'advance_months_at_booking', 'agency_fee_months_at_booking'];

    /**
     * « À verser à l'entrée » d'une candidature : loyer × max(1, mois d'avance) + caution + loyer ×
     * mois de frais, en décimal (jamais un flottant), arrondi au centime.
     *
     * `null` hors d'une candidature, et pour une candidature d'AVANT TCK-2870 : sans instantané
     * (`term_months` nul, toujours écrit depuis), un montant serait inventé.
     */
    public static function entryAmount(Booking $booking): ?string
    {
        if ($booking->kind !== BookingKind::Application || $booking->term_months === null || $booking->total_amount === null) {
            return null;
        }

        $loyer = (string) $booking->total_amount;
        $avance = max(1, (int) ($booking->advance_months_at_booking ?? 0));
        $frais = bcmul($loyer, (string) ($booking->agency_fee_months_at_booking ?? '0'), 4);
        $total = bcadd(bcadd(bcmul($loyer, (string) $avance, 4), (string) ($booking->security_deposit_amount ?? '0'), 4), $frais, 4);

        return CurrencyUnit::round($total, 2);
    }

    /**
     * TCK-2893 (ADR-0110 § 4) — le revenu déclaré rapporté au loyer de la candidature, arrondi au
     * dixième (demi au-dessus), en décimal : 950 000 / 300 000 → `3.2`. `null` hors candidature,
     * sans revenu, ou sans loyer positif. Ce n'est pas un masquage (ADR-0110, Conséquences) : il
     * n'est servi qu'au personnel de l'agence du bien.
     */
    public static function incomeToRentRatio(mixed $kind, mixed $income, mixed $rent): ?float
    {
        $kind = $kind instanceof BookingKind ? $kind : BookingKind::tryFrom((string) $kind);
        if ($kind !== BookingKind::Application || ! is_numeric($income) || ! is_numeric($rent) || bccomp((string) $rent, '0', 2) <= 0) {
            return null;
        }

        return (float) bcdiv(bcadd(bcdiv(bcmul((string) $income, '10', 4), (string) $rent, 4), '0.5', 4), '1', 0) / 10;
    }
}
