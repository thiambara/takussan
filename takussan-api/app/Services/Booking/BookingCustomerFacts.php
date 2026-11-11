<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\VisitStatus;
use App\Rules\PersonnelDeLAgence;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2593 — ce que la réservation dit de son client au seul personnel de l'agence : le téléphone
 * et l'étape de la fiche (`customer.phone`, `customer.pipeline_stage`), et `visits_on_property`,
 * le nombre de visites TERMINÉES de ce client sur ce bien (« visites passées sur ce bien »).
 *
 * **Le personnel** est jugé comme pour la fiche client d'une visite (TCK-590, passes 3 à 5) :
 * {@see PersonnelDeLAgence::personnelActifDe()} sur l'agence de la réservation, ou le super-admin.
 * Le client, le bailleur et l'agent d'une autre agence ne lisent ni l'un ni l'autre — la fiche est
 * du CRM de l'agence. Une réservation sans agence n'a pas de CRM d'agence : sa fiche n'est pas
 * masquée, mais `visits_on_property`, servi au personnel, n'y a aucun lecteur.
 *
 * **Une visite du client** : celle de sa fiche (`customer_id`), ou celle de son compte
 * (`visitor_id` = `customers.user_id`, une demande publique faite connecté). Une seule requête
 * groupée pour la page ({@see self::prime()}), posée en attribut de requête et relue par la
 * ressource : jamais une requête par ligne. Sans `prime()`, la clé est omise.
 */
final class BookingCustomerFacts
{
    private const VISITES = 'bookings.visits_on_property';

    private const PERSONNEL = 'bookings.staff_of';

    /**
     * @param  iterable<Booking>  $bookings
     */
    public static function prime(Request $request, iterable $bookings): void
    {
        $ids = [];
        foreach ($bookings as $booking) {
            if ($booking->customer_id !== null && self::servesStaff($request, $booking)) {
                $ids[] = (int) $booking->id;
            }
        }

        $counts = $ids === [] ? [] : DB::table('bookings as b')
            ->join('customers as c', 'c.id', '=', 'b.customer_id')
            ->join('property_visits as v', fn (JoinClause $j) => $j
                ->on('v.property_id', '=', 'b.property_id')
                ->where('v.status', VisitStatus::Completed->value)
                ->where(fn ($w) => $w
                    ->whereColumn('v.customer_id', 'b.customer_id')
                    ->orWhere(fn ($compte) => $compte->whereNotNull('c.user_id')->whereColumn('v.visitor_id', 'c.user_id'))))
            ->whereIn('b.id', $ids)
            ->groupBy('b.id')
            ->selectRaw('b.id as id, count(distinct v.id) as n')
            ->pluck('n', 'id')
            ->map(fn ($n) => (int) $n)
            ->all();

        $request->attributes->set(self::VISITES, $counts + array_fill_keys($ids, 0));
    }

    /** `null` : pas servi (lecteur hors du personnel, client absent, ou page non préparée). */
    public static function visitsOnProperty(Request $request, Booking $booking): ?int
    {
        $visites = $request->attributes->get(self::VISITES);

        return is_array($visites) && array_key_exists((int) $booking->id, $visites) ? $visites[(int) $booking->id] : null;
    }

    /**
     * Le téléphone et l'étape de la fiche sont-ils retirés ? Oui pour qui n'est pas du personnel
     * de l'agence de la réservation — et quand on ne connaît pas cette agence (colonne omise par un
     * sparse fieldset, bien non chargé) : mieux vaut retirer qu'exposer.
     */
    public static function masksCustomerCard(Request $request, Booking $booking): bool
    {
        [$connue, $agencyId] = self::agencyOf($booking);
        if ($connue && $agencyId === null) {
            return false;
        }

        return ! self::servesStaff($request, $booking);
    }

    private static function servesStaff(Request $request, Booking $booking): bool
    {
        $user = $request->user();
        if ($user === null) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }

        [$connue, $agencyId] = self::agencyOf($booking);
        if (! $connue || $agencyId === null) {
            return false;
        }

        $verdicts = $request->attributes->get(self::PERSONNEL, []);
        if (! array_key_exists($agencyId, $verdicts)) {
            $verdicts[$agencyId] = PersonnelDeLAgence::personnelActifDe($user, $agencyId);
            $request->attributes->set(self::PERSONNEL, $verdicts);
        }

        return $verdicts[$agencyId];
    }

    /** @return array{0: bool, 1: int|null} connue ?, agence */
    private static function agencyOf(Booking $booking): array
    {
        if (array_key_exists('agency_id', $booking->getAttributes())) {
            return [true, $booking->agency_id !== null ? (int) $booking->agency_id : null];
        }
        if ($booking->relationLoaded('property') && $booking->property !== null
            && array_key_exists('agency_id', $booking->property->getAttributes())) {
            return [true, $booking->property->agency_id !== null ? (int) $booking->property->agency_id : null];
        }

        return [false, null];
    }
}
