<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Support\Masking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2893 (ADR-0110 § 3 et 4) — ce que la réservation dit du garant et des revenus du candidat,
 * au SEUL personnel de l'agence du bien (le verdict de {@see BookingCustomerFacts::servesStaff()},
 * super-admin compris) :
 *
 * - `has_guarantor` et `guarantors` (`id`, prénom, nom, lien) ;
 * - `declared_monthly_income_masked` (`Masking::presence`, `••••` ou `null`) et
 *   `income_to_rent_ratio` (arrondi au dixième, {@see BookingConditions::incomeToRentRatio()}).
 *
 * Le montant n'est JAMAIS servi en clair ici. Préparé pour la page en deux requêtes
 * ({@see self::prime()}) lues par les ids, jamais par les attributs du modèle : la colonne chiffrée
 * est hors de `$queryFields`, et un sparse fieldset peut avoir omis `kind` ou `total_amount`. Sans
 * `prime()`, ou pour un autre lecteur (le client, le bailleur, un autre candidat, le tunnel
 * public), les quatre clés sont omises.
 */
final class BookingGuarantorFacts
{
    private const FAITS = 'bookings.guarantor_facts';

    /** @param  iterable<Booking>  $bookings */
    public static function prime(Request $request, iterable $bookings): void
    {
        $ids = [];
        foreach ($bookings as $booking) {
            if (BookingCustomerFacts::servesStaff($request, $booking)) {
                $ids[] = (int) $booking->id;
            }
        }
        if ($ids === []) {
            return;
        }

        $garants = DB::table('booking_guarantor as bg')
            ->join('guarantors as g', 'g.id', '=', 'bg.guarantor_id')
            ->whereIn('bg.booking_id', $ids)
            ->whereNull('g.deleted_at')
            ->orderBy('bg.id')
            ->get(['bg.booking_id', 'g.id', 'g.first_name', 'g.last_name', 'g.relationship_to_tenant'])
            ->groupBy('booking_id');

        $faits = [];
        foreach (DB::table('bookings')->whereIn('id', $ids)->get(['id', 'kind', 'total_amount', 'declared_monthly_income']) as $ligne) {
            $revenu = $ligne->declared_monthly_income !== null ? Crypt::decryptString($ligne->declared_monthly_income) : null;
            $liste = ($garants->get($ligne->id) ?? collect())->map(fn ($g): array => [
                'id' => (int) $g->id,
                'first_name' => $g->first_name,
                'last_name' => $g->last_name,
                'relationship_to_tenant' => $g->relationship_to_tenant,
            ])->values()->all();

            $faits[(int) $ligne->id] = [
                'has_guarantor' => $liste !== [],
                'guarantors' => $liste,
                'declared_monthly_income_masked' => Masking::presence($revenu),
                'income_to_rent_ratio' => BookingConditions::incomeToRentRatio($ligne->kind, $revenu, $ligne->total_amount),
            ];
        }

        $request->attributes->set(self::FAITS, $faits + ($request->attributes->get(self::FAITS) ?? []));
    }

    /**
     * `null` : pas servi (lecteur hors du personnel, ou page non préparée par `prime()`).
     *
     * @return array{has_guarantor: bool, guarantors: list<array<string, mixed>>, declared_monthly_income_masked: ?string, income_to_rent_ratio: ?float}|null
     */
    public static function for(Request $request, Booking $booking): ?array
    {
        $faits = $request->attributes->get(self::FAITS);

        return is_array($faits) && array_key_exists((int) $booking->id, $faits) ? $faits[(int) $booking->id] : null;
    }
}
