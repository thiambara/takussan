<?php

namespace App\Services\Booking;

use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Carbon\CarbonInterface;
use Illuminate\Validation\ValidationException;

/**
 * TCK-530 — le montant d'une réservation se calcule ICI, depuis le bien et les dates, jamais
 * depuis ce que le client envoie.
 *
 * Le tunnel calculait `prix × nuits` quelle que soit la période du loyer (un bien à 250 000 F /
 * mois réservé 10 nuits affichait 2 500 000 F), et `POST /api/bookings` enregistrait ce total
 * tel quel. Décision produit (session du 2026-09-16) :
 *
 * | bien | total |
 * |---|---|
 * | location `daily` | prix × nuits |
 * | location `weekly` | prix × nuits / 7 |
 * | location `monthly` / `yearly` (ou période absente, que le modèle ramène à `monthly`) | **refusé** : relève du bail (features §1.4), pas de la réservation courte durée |
 * | vente, ou type de contrat absent | prix (ce que le tunnel affichait déjà) |
 *
 * Acompte : 30 % du total (features §1.3).
 *
 * ARITHMÉTIQUE — entière, en centimes : `decimal:2` rend le prix en chaîne, on la découpe sans
 * passer par un flottant, et toute division arrondit **au demi supérieur** à l'unité mineure de
 * la devise (`Currency::decimalPlaces()`) : au franc pour XOF/XAF, qui n'ont pas de sous-unité,
 * au centime pour EUR/USD. Le front (`takussan-web/src/lib/booking-quote.ts`) applique la même règle
 * pour l'AFFICHAGE ; le serveur ne la lui emprunte jamais.
 */
class BookingQuote
{
    public const DEPOSIT_PERCENT = 30;

    /** Clés de `lang/{fr,en,wo}/bookings.php`. Le tunnel n'atteint aucune d'elles : il refuse avant. */
    public const CODE_PERIOD_NOT_BOOKABLE = 'rent_period_not_bookable';

    public const CODE_DATES_REQUIRED = 'dates_required';

    public const CODE_AMOUNT_MISMATCH = 'amount_mismatch';

    public const CODE_CURRENCY_MISMATCH = 'currency_mismatch';

    public const CODE_STAY_TOO_LONG = 'stay_too_long';

    /**
     * Plus grand montant que `bookings.total_amount` (`decimal(14,2)`) peut porter, arrondi au
     * franc pour rester un multiple de tout pas de devise. Sans cette borne, un séjour de
     * plusieurs millénaires (`end_date` n'a pas de plafond) débordait l'entier à l'acompte et
     * rendait une 500 (`intdiv(): … float given`) — vérification adverse TCK-530.
     */
    private const MAX_CENTS = 99_999_999_999_900;

    /**
     * @return array{total_amount: string, deposit_amount: string, currency: Currency}
     *
     * @throws ValidationException le bien n'est pas réservable en courte durée, ou les dates manquent
     *                             ou couvrent un séjour dont le total déborde la colonne
     */
    public function for(Property $property, ?CarbonInterface $start, ?CarbonInterface $end): array
    {
        $priceCents = self::toCents((string) ($property->price ?? '0'));
        $currency = $property->currency ?? Currency::default();
        $step = 10 ** (2 - $currency->decimalPlaces());

        if ($property->contract_type !== ContractType::Rent) {
            // Arrondi à l'unité mineure comme tout le reste : un prix XOF à centimes rendait un
            // total à centimes et un acompte au franc (vérification adverse de TCK-530).
            $totalCents = self::roundHalfUp($priceCents, $step) * $step;
        } else {
            $divisor = match ($property->rent_period) {
                RentPeriod::Daily => 1,
                RentPeriod::Weekly => 7,
                default => throw ValidationException::withMessages([
                    'property_id' => [__('bookings.'.self::CODE_PERIOD_NOT_BOOKABLE)],
                ]),
            };

            $nights = ($start !== null && $end !== null) ? (int) $start->diffInDays($end) : 0;
            if ($nights < 1) {
                throw ValidationException::withMessages([
                    'end_date' => [__('bookings.'.self::CODE_DATES_REQUIRED)],
                ]);
            }

            // p × n ≤ MAX × d garantit à la fois l'absence de débordement et un total ≤ MAX.
            if ($priceCents > 0 && $nights > intdiv(self::MAX_CENTS * $divisor, $priceCents)) {
                throw ValidationException::withMessages([
                    'end_date' => [__('bookings.'.self::CODE_STAY_TOO_LONG)],
                ]);
            }

            $totalCents = self::roundHalfUp($priceCents * $nights, $divisor * $step) * $step;
        }

        $depositCents = self::roundHalfUp($totalCents * self::DEPOSIT_PERCENT, 100 * $step) * $step;

        return [
            'total_amount' => self::fromCents($totalCents),
            'deposit_amount' => self::fromCents($depositCents),
            // Les montants sont exprimés dans la devise du BIEN : l'enregistrer dans une autre
            // (le défaut XOF, ou celle du client) changerait leur valeur.
            'currency' => $currency,
        ];
    }

    /**
     * Même montant à l'unité mineure près ? `$amount` a déjà passé la règle `decimal:0,2`.
     */
    public static function sameAmount(string $amount, string $reference): bool
    {
        return self::toCents($amount) === self::toCents($reference);
    }

    /** « 20000.5 » → 2000050. Montants positifs ou nuls, au plus deux décimales. */
    private static function toCents(string $amount): int
    {
        [$units, $fraction] = explode('.', ltrim($amount, '+'), 2) + [1 => ''];

        return (int) $units * 100 + (int) str_pad(substr($fraction, 0, 2), 2, '0');
    }

    private static function fromCents(int $cents): string
    {
        return intdiv($cents, 100).'.'.str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    /** round(a / b), demi vers le haut, pour a ≥ 0 et b > 0. */
    private static function roundHalfUp(int $numerator, int $denominator): int
    {
        return intdiv(2 * $numerator + $denominator, 2 * $denominator);
    }
}
