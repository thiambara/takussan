<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Rules\PersonnelDeLAgence;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2593 — ce que la réservation dit de son client au seul personnel de l'agence : le téléphone
 * et l'étape de la fiche (`customer.phone`, `customer.pipeline_stage`), et `visits_on_property`,
 * le nombre de visites TERMINÉES de ce client sur ce bien (« visites passées sur ce bien »).
 *
 * **Le personnel** est jugé comme pour la fiche client d'une visite (TCK-590, passes 3 à 5) :
 * {@see PersonnelDeLAgence::personnelActifDe()} sur l'agence de la réservation, ou le super-admin.
 * Le client et l'agent d'une autre agence ne lisent ni l'un ni l'autre — la fiche est du CRM de
 * l'agence. Le BAILLEUR du bien lit le téléphone et l'étape, pas les visites (décision du porteur,
 * 2026-11-11 : il doit pouvoir joindre le candidat). Une réservation sans agence n'a pas de CRM d'agence : sa fiche n'est pas
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

    private const BAILLEUR = 'bookings.landlord_of';

    // TCK-2870
    private const DERNIERE_VISITE = 'bookings.last_visit_on_property';

    // TCK-2870
    private const FAITS_DU_BIEN = 'bookings.property_facts';

    /**
     * @param  iterable<Booking>  $bookings
     */
    public static function prime(Request $request, iterable $bookings): void
    {
        $ids = [];
        $biens = [];
        $personnel = [];
        foreach ($bookings as $booking) {
            $servi = self::servesStaff($request, $booking);
            if ($servi) {
                $personnel[] = (int) $booking->id;
            }
            if ($booking->customer_id !== null && $servi) {
                $ids[] = (int) $booking->id;
            } elseif ($booking->property_id !== null) {
                $biens[(int) $booking->property_id] = true;
            }
        }
        self::primeLandlord($request, array_keys($biens));
        self::primePropertyFacts($request, $personnel);

        $lignes = $ids === [] ? collect() : DB::table('bookings as b')
            ->join('customers as c', 'c.id', '=', 'b.customer_id')
            ->join('property_visits as v', fn (JoinClause $j) => $j
                ->on('v.property_id', '=', 'b.property_id')
                ->where('v.status', VisitStatus::Completed->value)
                ->where(fn ($w) => $w
                    ->whereColumn('v.customer_id', 'b.customer_id')
                    ->orWhere(fn ($compte) => $compte->whereNotNull('c.user_id')->whereColumn('v.visitor_id', 'c.user_id'))))
            ->whereIn('b.id', $ids)
            ->groupBy('b.id')
            // TCK-2870 — la dernière visite terminée (date, puis id pour départager) et son verdict
            // de compte rendu, dans la même requête.
            ->selectRaw('b.id as id, count(distinct v.id) as n, (array_agg(v.scheduled_at order by v.scheduled_at desc, v.id desc))[1] as last_at, (array_agg(v.report_outcome order by v.scheduled_at desc, v.id desc))[1] as last_outcome')
            ->get()
            ->keyBy('id');

        $counts = $lignes->map(fn ($l) => (int) $l->n)->all();
        $request->attributes->set(self::VISITES, $counts + array_fill_keys($ids, 0));

        $dernieres = $lignes->map(fn ($l): array => [
            'scheduled_at' => Carbon::parse($l->last_at),
            'report_verdict' => $l->last_outcome,
        ])->all();
        $request->attributes->set(self::DERNIERE_VISITE, $dernieres + array_fill_keys($ids, null));
    }

    /**
     * TCK-2870 — la dernière visite terminée de ce client sur ce bien (`scheduled_at`, et le verdict
     * de son compte rendu, `report_verdict`), servie avec `visits_on_property` au seul personnel ;
     * `null` dans le tableau rendu quand il n'y en a aucune.
     *
     * @return array{0: bool, 1: array{scheduled_at: \DateTimeInterface, report_verdict: ?string}|null} servie ?, valeur
     */
    public static function lastVisitOnProperty(Request $request, Booking $booking): array
    {
        $dernieres = $request->attributes->get(self::DERNIERE_VISITE);
        if (! is_array($dernieres) || ! array_key_exists((int) $booking->id, $dernieres)) {
            return [false, null];
        }

        return [true, $dernieres[(int) $booking->id]];
    }

    /**
     * TCK-2870 (ADR-0110, maquette e4 « 6 visites · première offre reçue ») — ce que le bien dit
     * autour de la réservation, au seul personnel de l'agence, en UNE requête pour la page :
     *
     * - `other_pending_on_property` : les AUTRES réservations `pending` de même nature sur le bien ;
     * - `property_visits_count` : les visites terminées du bien, tous visiteurs ;
     * - `offer_rank` (offre seule) : son rang parmi toutes les offres reçues sur le bien, quel que
     *   soit leur statut, par date de création puis id — calculé sur TOUTES les offres du bien, pas
     *   sur les seules lignes de la page.
     *
     * Lu par les ids en SQL, jamais par les attributs du modèle : un sparse fieldset peut avoir omis
     * `kind` ou `property_id`. Les réservations supprimées (douce) ne comptent pas.
     *
     * @param  list<int>  $ids
     */
    private static function primePropertyFacts(Request $request, array $ids): void
    {
        if ($ids === []) {
            return;
        }

        $offre = BookingKind::Offer->value;
        $faits = DB::table('bookings as b')
            ->whereIn('b.id', $ids)
            ->selectRaw('b.id as id')
            ->selectRaw('(select count(*) from bookings o where o.property_id = b.property_id and o.kind = b.kind and o.status = ? and o.id <> b.id and o.deleted_at is null) as other_pending', [BookingStatus::Pending->value])
            ->selectRaw('(select count(*) from property_visits v where v.property_id = b.property_id and v.status = ?) as visits', [VisitStatus::Completed->value])
            ->selectRaw('case when b.kind = ? then (select count(*) from bookings o where o.property_id = b.property_id and o.kind = ? and o.deleted_at is null and (o.created_at < b.created_at or (o.created_at = b.created_at and o.id <= b.id))) end as offer_rank', [$offre, $offre])
            ->get()
            ->mapWithKeys(fn ($l): array => [(int) $l->id => [
                'other_pending_on_property' => (int) $l->other_pending,
                'property_visits_count' => (int) $l->visits,
                'offer_rank' => $l->offer_rank !== null ? (int) $l->offer_rank : null,
            ]])
            ->all();

        $request->attributes->set(self::FAITS_DU_BIEN, $faits + ($request->attributes->get(self::FAITS_DU_BIEN) ?? []));
    }

    /**
     * TCK-2870 — `null` : pas servi (lecteur hors du personnel, ou page non préparée par `prime()`).
     *
     * @return array{other_pending_on_property: int, property_visits_count: int, offer_rank: ?int}|null
     */
    public static function propertyFacts(Request $request, Booking $booking): ?array
    {
        $faits = $request->attributes->get(self::FAITS_DU_BIEN);

        return is_array($faits) && array_key_exists((int) $booking->id, $faits) ? $faits[(int) $booking->id] : null;
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

        return ! self::servesStaff($request, $booking) && ! self::servesLandlord($request, $booking);
    }

    /**
     * Décision du porteur (2026-11-11) : le bailleur du bien lit le téléphone et l'étape du
     * candidat — il doit pouvoir le joindre. `visits_on_property` reste au seul personnel.
     * Bailleur au sens de {@see BailleurDuBien::est()} (le créateur du bien, s'il est bailleur).
     * Préparé pour la page par {@see self::primeLandlord()} ; hors `prime()`, une requête par bien.
     */
    /**
     * Le verdict « bailleur » de chaque bien de la page, en UNE requête : jamais une par ligne.
     *
     * @param  list<int>  $propertyIds
     */
    private static function primeLandlord(Request $request, array $propertyIds): void
    {
        $user = $request->user();
        if ($user === null || $propertyIds === []) {
            return;
        }
        $biens = $request->attributes->get(self::BAILLEUR, []);
        $manquants = array_values(array_diff($propertyIds, array_keys($biens)));
        if ($manquants === []) {
            return;
        }
        $lignes = DB::table('properties')->whereIn('id', $manquants)->get(['id', 'user_id', 'agency_id'])->keyBy('id');
        foreach ($manquants as $id) {
            $bien = $lignes->get($id);
            $biens[$id] = $bien !== null && BailleurDuBien::est($user, $bien->user_id, $bien->agency_id);
        }
        $request->attributes->set(self::BAILLEUR, $biens);
    }

    private static function servesLandlord(Request $request, Booking $booking): bool
    {
        $user = $request->user();
        if ($user === null || $booking->property_id === null) {
            return false;
        }

        $biens = $request->attributes->get(self::BAILLEUR, []);
        $id = (int) $booking->property_id;
        if (! array_key_exists($id, $biens)) {
            $bien = $booking->relationLoaded('property') && $booking->property !== null
                && array_key_exists('user_id', $booking->property->getAttributes())
                && array_key_exists('agency_id', $booking->property->getAttributes())
                ? $booking->property
                : DB::table('properties')->where('id', $id)->first(['user_id', 'agency_id']);
            $biens[$id] = $bien !== null && BailleurDuBien::est($user, $bien->user_id, $bien->agency_id);
            $request->attributes->set(self::BAILLEUR, $biens);
        }

        return $biens[$id];
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
