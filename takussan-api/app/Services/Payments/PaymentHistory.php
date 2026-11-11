<?php

namespace App\Services\Payments;

use App\Http\Filters\DateBoundaryFilter;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use App\Services\Reporting\OverdueInstalment;
use App\Support\CaseInsensitive;
use App\Support\DayRange;
use App\Support\Http\ParametreUnique;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * TCK-2721 — LA sélection de l'historique consolidé des paiements (`BookingPayment` et
 * `LeasePayment`) : cloisonnement du lecteur, filtres, lignes, tri et plafond. Extraite telle quelle
 * de `PaymentController::history`, qui la pagine, et lue aussi par l'export du registre
 * (`ExportDataService::paymentHistory`) : une seule requête pour la liste et le fichier — un
 * lecteur n'exporte jamais une ligne que la liste ne lui montrerait pas.
 *
 * Les filtres refusés (422) le sont ici, dans l'ordre d'avant l'extraction ; le contrat des
 * paramètres est décrit sur `PaymentController::history()`.
 */
class PaymentHistory
{
    /** Le plafond de la liste : la fusion des deux sources se fait en PHP. L'export passe le sien. */
    public const HARD_LIMIT = 5000;

    public function __construct(
        private readonly PaymentGatewayService $gateway,
        private readonly LeasePaymentReminderReader $reminderReader,
    ) {}

    /** P216.02 (TCK-2122) — un tri en liste vaut le tri par défaut, et n'est plus casté. */
    public static function sort(mixed $sort): string
    {
        return $sort === null ? '' : ParametreUnique::valeur($sort) ?? '-date';
    }

    /**
     * Les lignes de l'historique pour ce lecteur, filtrées, triées et coupées à `$maxRows`.
     *
     * @param  array<array-key, mixed>  $filters  le `filter[…]` de la requête
     * @param  list<string>  $includes  {@see self::requestedIncludes()}
     * @return array{rows: Collection<int, array<string, mixed>>, truncated: bool, lease_payments: EloquentCollection<int, LeasePayment>}
     */
    public function select(User $user, array $filters, array $includes, string $sort, int $maxRows): array
    {
        // TCK-2657 — les paramètres neufs, lus et refusés AVANT toute requête. Une valeur en liste
        // vaut une valeur absente (ADR-0075).
        $payerId = $this->idFilter($filters['payer_id'] ?? null);
        $landlordId = $this->idFilter($filters['landlord_id'] ?? null);
        $methods = $this->paymentMethodFilter($filters['payment_method'] ?? null);
        $search = $this->searchTerms($filters['search'] ?? null);
        $daysLateMin = $this->daysLateFilter($filters['days_late_min'] ?? null);
        $daysLateMax = $this->daysLateFilter($filters['days_late_max'] ?? null);

        $bookingQuery = BookingPayment::query()
            ->with('booking.property')
            ->when(in_array('payer', $includes, true), fn ($q) => $q->with(['booking.customer' => fn ($c) => $c->withTrashed()]))
            ->when(in_array('landlord', $includes, true), fn ($q) => $q->with(['booking.property.owner' => fn ($u) => $u->withTrashed()]))
            ->when(! $user->isSuperAdmin(), function ($q) use ($user): void {
                // P233.01 (TCK-2241) — l'auteur encore membre de l'agence de la réservation, comme
                // `BookingController::index` et `BookingPolicy::view` depuis TCK-2196 (ADR-0031, B.2).
                $memberAgencyIds = app(MembershipCapabilityResolver::class)->memberAgencyIds($user);
                $q->whereHas('booking', function ($bq) use ($user, $memberAgencyIds): void {
                    $bq->where(function ($inner) use ($user, $memberAgencyIds): void {
                        $inner->where(fn ($a) => $a->where('created_by_id', $user->id)
                            ->where(fn ($m) => $m->whereNull('agency_id')->orWhereIn('agency_id', $memberAgencyIds)))
                            // TCK-1932 (P190.03) — le bailleur du bien, comme `BookingPaymentPolicy`.
                            ->orWhereHas('property', fn ($p) => BailleurDuBien::restreindre($p, $user));
                        // TCK-587 — le personnel de l'agence, plus tout membre (ADR-0031).
                        if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                            $inner->orWhere('agency_id', $staffAgencyId);
                        }
                        $inner->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));
                    });
                });
            });

        $leaseQuery = LeasePayment::query()
            ->with(['lease.property', 'lease.agency'])
            ->when(in_array('payer', $includes, true), fn ($q) => $q->with(['payer' => fn ($c) => $c->withTrashed()]))
            ->when(in_array('landlord', $includes, true), fn ($q) => $q->with(['lease.landlord' => fn ($u) => $u->withTrashed()]))
            ->when(! $user->isSuperAdmin(), function ($q) use ($user): void {
                $q->whereHas('lease', function ($lq) use ($user): void {
                    $lq->where(function ($inner) use ($user): void {
                        // TCK-2181 (P217.03) — le bailleur du bail, comme `LeaseController::index` et la
                        // branche des acomptes ci-dessus : l'agent recopié en `landlord_id` passe par le personnel.
                        $inner->where(fn ($l) => BailleurDuBien::restreindre($l, $user, 'landlord_id'));
                        if (($staffAgencyId = $user->staffAgencyId()) !== null) {
                            $inner->orWhere('agency_id', $staffAgencyId);
                        }
                        $inner->orWhereHas('tenant', fn ($c) => $c->where('user_id', $user->id));
                    });
                });
            });

        // Entity-scoped filtering
        // P216.02 (TCK-2122) — un type en liste vaut un type absent (TCK-1407), et n'est plus casté.
        $entityType = ParametreUnique::valeur($filters['entity_type'] ?? null);
        $entityType = $entityType !== null ? strtolower($entityType) : null;
        $entityId = $filters['entity_id'] ?? null;

        if ($entityType && $entityId) {
            $this->applyEntityFilter($bookingQuery, $leaseQuery, $entityType, (int) $entityId);
        }

        // Status filter — TCK-593 : une liste séparée par des virgules (`pending,late,failed`), pour
        // que le locataire obtienne « ce que je dois » sans filtrer côté client.
        if (! empty($filters['status'])) {
            // P216.02 (TCK-2122) — un statut en liste se lit comme un statut inconnu, et n'est plus casté.
            if (is_array($filters['status'])) {
                abort_code(422, 'payment.filter_status_invalid');
            }
            $statuses = array_map(
                fn (string $value) => PaymentStatus::tryFrom(trim($value)),
                explode(',', (string) $filters['status']),
            );
            if (in_array(null, $statuses, true)) {
                abort_code(422, 'payment.filter_status_invalid');
            }
            $bookingQuery->whereIn('status', $statuses);
            $leaseQuery->whereIn('status', $statuses);
        }

        // Date range — use paid_at for booking payments and paid_at/due_date/period_start for lease payments.
        if (! empty($filters['date_from'])) {
            DateBoundaryFilter::exiger($filters['date_from'], 'date_from');
            $from = $filters['date_from'];
            $bookingQuery->where(function ($q) use ($from): void {
                $q->where('paid_at', '>=', DayRange::start($from))->orWhere('created_at', '>=', DayRange::start($from));
            });
            $leaseQuery->where(function ($q) use ($from): void {
                $q->where('paid_at', '>=', DayRange::start($from))->orWhereDate('period_start', '>=', $from);
            });
        }
        if (! empty($filters['date_to'])) {
            DateBoundaryFilter::exiger($filters['date_to'], 'date_to');
            $to = $filters['date_to'];
            $bookingQuery->where(function ($q) use ($to): void {
                $q->where('paid_at', '<', DayRange::after($to))->orWhere('created_at', '<', DayRange::after($to));
            });
            $leaseQuery->where(function ($q) use ($to): void {
                $q->where('paid_at', '<', DayRange::after($to))->orWhereDate('period_start', '<=', $to);
            });
        }

        // Refus de TCK-2659 (M1) — l'ENCAISSÉ d'une période : `paid_at` SEUL, borné au jour (Dakar,
        // UTC+0 : `DayRange` lit le fuseau de l'application). C'est le sens de la tuile « Encaissé en
        // <mois> » (`FinanceSummaryService::collected()`), là où `date_from`/`date_to` retiennent
        // `paid_at` OU `period_start` (une échéance de la période, payée ou non) — et gardent ce sens
        // pour les autres écrans. Une échéance jamais payée n'y entre donc jamais.
        foreach (['paid_from' => '>=', 'paid_to' => '<'] as $cle => $operateur) {
            if (empty($filters[$cle])) {
                continue;
            }
            DateBoundaryFilter::exiger($filters[$cle], $cle);
            $borne = $cle === 'paid_from' ? DayRange::start($filters[$cle]) : DayRange::after($filters[$cle]);
            $bookingQuery->where('paid_at', $operateur, $borne);
            $leaseQuery->where('paid_at', $operateur, $borne);
        }

        // TCK-2657 — les filtres métier, posés en SQL avant le comptage et le plafond : filtrer
        // après les 5 000 lignes rendrait un compte et un `truncated` faux.
        $today = OverdueInstalment::today();
        $this->applyBusinessFilters($bookingQuery, $leaseQuery, $payerId, $landlordId, $methods, $search, $daysLateMin, $daysLateMax, $today);

        // TCK-2657 — `days_late` sort dès qu'un paramètre neuf est passé ; sans lui, la ligne garde sa
        // forme d'avant, clé pour clé (AC1).
        $extended = $includes !== [] || $payerId !== null || $landlordId !== null || $methods !== null
            || $search !== [] || $daysLateMin !== null || $daysLateMax !== null || ltrim($sort, '-') === 'days_late';

        // Hard cap to keep the merge-in-PHP strategy bounded. Beyond this the
        // caller must narrow the filter (entity, date range, status). The
        // `meta.truncated` flag warns that totals are computed on the capped
        // slice only.
        $bookingCount = (clone $bookingQuery)->toBase()->getCountForPagination();
        $leaseCount = (clone $leaseQuery)->toBase()->getCountForPagination();
        $truncated = ($bookingCount + $leaseCount) > $maxRows;

        $bookingRows = $bookingQuery->limit($maxRows)->get()
            ->map(fn (BookingPayment $p) => $this->bookingRow($p) + ($extended ? $this->bookingExtras($p, $includes) : []));
        $leasePayments = $leaseQuery->limit($maxRows)->get();
        $leaseRows = $leasePayments
            ->map(fn (LeasePayment $p) => $this->leaseRow($p) + ($extended ? $this->leaseExtras($p, $includes, $today) : []));

        $merged = $bookingRows->concat($leaseRows)->values();
        $merged = $this->applySort($merged, $sort);

        if ($merged->count() > $maxRows) {
            $merged = $merged->take($maxRows)->values();
            $truncated = true;
        }

        return ['rows' => $merged, 'truncated' => $truncated, 'lease_payments' => $leasePayments];
    }

    /**
     * @param  Builder<BookingPayment>  $bookingQuery
     * @param  Builder<LeasePayment>  $leaseQuery
     */
    private function applyEntityFilter($bookingQuery, $leaseQuery, string $entityType, int $entityId): void
    {
        switch ($entityType) {
            case 'booking':
                $bookingQuery->where('booking_id', $entityId);
                $leaseQuery->whereRaw('1 = 0'); // exclude lease payments
                break;

            case 'lease':
                $leaseQuery->where('lease_id', $entityId);
                $bookingQuery->whereRaw('1 = 0');
                break;

            case 'customer':
                $bookingQuery->whereHas('booking', fn ($q) => $q->where('customer_id', $entityId));
                $leaseQuery->where('payer_id', $entityId);
                break;

            case 'property':
                abort_code_unless(Property::whereKey($entityId)->exists(), 404, 'property.not_found');
                $bookingQuery->whereHas('booking', fn ($q) => $q->where('property_id', $entityId));
                $leaseQuery->whereHas('lease', fn ($q) => $q->where('property_id', $entityId));
                break;

            default:
                abort_code(422, 'payment.filter_entity_invalid');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function bookingRow(BookingPayment $p): array
    {
        $booking = $p->booking;

        return [
            'source' => 'booking',
            'id' => $p->id,
            'reference_number' => $p->reference_number,
            'amount' => (float) $p->amount,
            'currency' => $p->currency?->value,
            'payment_method' => $p->payment_method?->value,
            'payment_type' => $p->payment_type?->value,
            'status' => $p->status?->value,
            'paid_amount' => (float) $p->paid_amount,
            'remaining_amount' => (float) $p->remaining_amount,
            'date' => ($p->paid_at ?? $p->created_at)?->toISOString(),
            'paid_at' => $p->paid_at?->toISOString(),
            'booking_id' => $p->booking_id,
            'lease_id' => null,
            'property_id' => $booking?->property_id,
            'customer_id' => $booking?->customer_id,
            'created_at' => $p->created_at?->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function leaseRow(LeasePayment $p): array
    {
        $lease = $p->lease;

        return [
            'source' => 'lease',
            'id' => $p->id,
            'reference_number' => $p->reference_number,
            'amount' => (float) $p->amount,
            'currency' => $p->currency?->value,
            'payment_method' => $p->payment_method?->value,
            'payment_type' => $p->payment_type?->value,
            'status' => $p->status?->value,
            'paid_amount' => (float) $p->paid_amount,
            'remaining_amount' => (float) $p->remaining_amount,
            // TCK-593 — la même lecture que `LeasePaymentResource` : l'historique ne refait aucun calcul.
            'late_fee_amount' => $p->late_fee_amount !== null ? (float) $p->late_fee_amount : null,
            'late_fee_outstanding' => $p->lateFeeOutstanding(),
            'late_fee_payable_online' => $this->gateway->lateFeeIncluded($p),
            'amount_due' => (float) ($this->gateway->amountDue($p) ?? 0),
            // TCK-1500 (P94.04) — la date de TRI de la ligne : le paiement s'il a eu lieu, sinon, pour
            // une échéance impayée, le début de sa période (date calendaire) mis à minuit UTC, puis la
            // création. Choix explicite, figé par `CalendarDatesInWriteResponsesTest` ; la date
            // calendaire elle-même sort dans `period_start`.
            'date' => ($p->paid_at ?? $p->period_start?->startOfDay() ?? $p->created_at)?->toISOString(),
            'paid_at' => $p->paid_at?->toISOString(),
            'period_start' => $p->period_start?->toDateString(),
            'period_end' => $p->period_end?->toDateString(),
            'due_date' => $p->due_date?->toDateString(),
            'booking_id' => null,
            'lease_id' => $p->lease_id,
            'property_id' => $lease?->property_id,
            'customer_id' => $p->payer_id,
            'created_at' => $p->created_at?->toISOString(),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    private function applySort(Collection $rows, string $sort): Collection
    {
        $desc = str_starts_with($sort, '-');
        $field = ltrim($sort, '-');
        $allowed = ['date', 'amount', 'remaining_amount', 'created_at', 'days_late'];
        if (! in_array($field, $allowed, true)) {
            $field = 'date';
            $desc = true;
        }

        // TCK-2657 — une ligne sans retard (`null`) se range en dernier, dans les deux sens.
        if ($field === 'days_late') {
            [$late, $notLate] = $rows->partition(fn (array $row) => $row['days_late'] !== null);
            $late = $desc ? $late->sortByDesc('days_late') : $late->sortBy('days_late');

            return $late->concat($notLate)->values();
        }

        return $desc
            ? $rows->sortByDesc($field)->values()
            : $rows->sortBy($field)->values();
    }

    /** TCK-2657 — les relations nommées qu'une ligne peut porter, à la demande. */
    private const HISTORY_INCLUDES = ['payer', 'property', 'landlord', 'reminders'];

    /** TCK-2657 — au-delà, les mots saisis sont ignorés (même borne que la recherche des conversations). */
    private const SEARCH_MAX_TERMS = 6;

    /**
     * Les relations demandées par `include=payer,property,landlord`. Un nom inconnu est ignoré ; un
     * `include` en liste vaut un `include` absent (ADR-0075).
     *
     * @return list<string>
     */
    public function requestedIncludes(Request $request): array
    {
        $raw = ParametreUnique::chaine($request, 'include');
        if ($raw === null) {
            return [];
        }

        return array_values(array_intersect(self::HISTORY_INCLUDES, array_map('trim', explode(',', $raw))));
    }

    /** Un identifiant (`filter[payer_id]`, `filter[landlord_id]`) : entier positif, sinon 422. */
    private function idFilter(mixed $value): ?int
    {
        $value = ParametreUnique::valeur($value);
        if ($value === null) {
            return null;
        }
        abort_code_unless(ctype_digit($value), 422, 'payment.filter_id_invalid');

        return (int) $value;
    }

    /** Un nombre de jours de retard (`filter[days_late_min]`, `filter[days_late_max]`) : entier ≥ 0, sinon 422. */
    private function daysLateFilter(mixed $value): ?int
    {
        $value = ParametreUnique::valeur($value);
        if ($value === null) {
            return null;
        }
        abort_code_unless(ctype_digit($value), 422, 'payment.filter_days_late_invalid');

        return (int) $value;
    }

    /**
     * `filter[payment_method]=wave,cash` : une liste séparée par des virgules, comme `filter[status]`.
     *
     * @return list<string>|null
     */
    private function paymentMethodFilter(mixed $value): ?array
    {
        $value = ParametreUnique::valeur($value);
        if ($value === null) {
            return null;
        }
        $methods = array_map(fn (string $m) => PaymentMethod::tryFrom(trim($m)), explode(',', $value));
        abort_code_if(in_array(null, $methods, true), 422, 'payment.filter_payment_method_invalid');

        return array_map(fn (PaymentMethod $m) => $m->value, $methods);
    }

    /**
     * Les mots de `filter[search]`, repliés et échappés pour `LIKE` (`%` et `_` cherchent un
     * caractère, pas « tout ») ; chacun doit apparaître dans une des colonnes (ET entre les mots, OU
     * entre les colonnes), comme `HasQueryBuilder::matchEveryTerm`.
     *
     * @return list<string> les motifs `%mot%`
     */
    private function searchTerms(mixed $value): array
    {
        $value = ParametreUnique::valeur($value);
        if ($value === null) {
            return [];
        }
        $words = array_slice(preg_split('/\s+/u', trim($value), -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, self::SEARCH_MAX_TERMS);

        return array_map(fn (string $w) => '%'.addcslashes(CaseInsensitive::fold($w), '\\%_').'%', $words);
    }

    /**
     * TCK-2657 — payeur, bailleur, moyen, recherche libre et jours de retard, des deux côtés.
     *
     * Le payeur et le bailleur se lisent aux mêmes colonnes que les lignes et leur `include` : le
     * payeur d'une échéance est `lease_payments.payer_id`, celui d'une réservation son client
     * (`bookings.customer_id`, comme `customer_id` de la ligne) ; le bailleur d'un bail est
     * `leases.landlord_id` (la balance âgée groupe par lui), celui d'une réservation le titulaire du
     * bien (`properties.user_id`).
     *
     * Le retard est la règle *Impayé* ({@see CollectedPayments::leaseOwed()}, échue AVANT
     * aujourd'hui, heure de Dakar), celle de la balance âgée et du point du mois : une réservation n'a
     * pas d'échéance, elle sort dès qu'une borne de retard est posée.
     *
     * @param  Builder<BookingPayment>  $bookingQuery
     * @param  Builder<LeasePayment>  $leaseQuery
     * @param  list<string>|null  $methods
     * @param  list<string>  $search
     */
    private function applyBusinessFilters(
        Builder $bookingQuery,
        Builder $leaseQuery,
        ?int $payerId,
        ?int $landlordId,
        ?array $methods,
        array $search,
        ?int $daysLateMin,
        ?int $daysLateMax,
        string $today,
    ): void {
        if ($payerId !== null) {
            $leaseQuery->where('lease_payments.payer_id', $payerId);
            $bookingQuery->whereHas('booking', fn ($q) => $q->where('customer_id', $payerId));
        }

        if ($landlordId !== null) {
            $leaseQuery->whereHas('lease', fn ($q) => $q->where('landlord_id', $landlordId));
            $bookingQuery->whereHas('booking.property', fn ($q) => $q->where('user_id', $landlordId));
        }

        if ($methods !== null) {
            $leaseQuery->whereIn('lease_payments.payment_method', $methods);
            $bookingQuery->whereIn('booking_payments.payment_method', $methods);
        }

        $names = fn ($q, string $motif) => $q->withTrashed()->where(fn ($w) => $w
            ->whereRaw(CaseInsensitive::sql('customers.first_name').' like ?', [$motif])
            ->orWhereRaw(CaseInsensitive::sql('customers.last_name').' like ?', [$motif]));
        $property = fn ($q, string $motif) => $q->where(fn ($w) => $w
            ->whereRaw(CaseInsensitive::sql('properties.title').' like ?', [$motif])
            ->orWhereRaw(CaseInsensitive::sql('properties.reference_number').' like ?', [$motif]));
        foreach ($search as $motif) {
            $leaseQuery->where(fn ($q) => $q
                ->whereRaw(CaseInsensitive::sql('lease_payments.reference_number').' like ?', [$motif])
                ->orWhereHas('payer', fn ($c) => $names($c, $motif))
                ->orWhereHas('lease.property', fn ($p) => $property($p, $motif)));
            $bookingQuery->where(fn ($q) => $q
                ->whereRaw(CaseInsensitive::sql('booking_payments.reference_number').' like ?', [$motif])
                ->orWhereHas('booking.customer', fn ($c) => $names($c, $motif))
                ->orWhereHas('booking.property', fn ($p) => $property($p, $motif)));
        }

        if ($daysLateMin !== null || $daysLateMax !== null) {
            CollectedPayments::leaseOwed($leaseQuery)->whereDate('lease_payments.due_date', '<', $today);
            if ($daysLateMin !== null) {
                $leaseQuery->whereRaw('(?::date - lease_payments.due_date) >= ?', [$today, $daysLateMin]);
            }
            if ($daysLateMax !== null) {
                $leaseQuery->whereRaw('(?::date - lease_payments.due_date) <= ?', [$today, $daysLateMax]);
            }
            $bookingQuery->whereRaw('1 = 0');
        }
    }

    /**
     * @param  list<string>  $includes
     * @return array<string, mixed>
     */
    private function leaseExtras(LeasePayment $p, array $includes, string $today): array
    {
        $lease = $p->lease;

        return ['days_late' => OverdueInstalment::daysLate($p, $today)] + $this->named(
            $includes,
            fn () => $p->payer,
            fn () => $lease?->property,
            fn () => $lease?->landlord,
        );
    }

    /**
     * @param  list<string>  $includes
     * @return array<string, mixed>
     */
    private function bookingExtras(BookingPayment $p, array $includes): array
    {
        $booking = $p->booking;

        return ['days_late' => null] + $this->named(
            $includes,
            fn () => $booking?->customer,
            fn () => $booking?->property,
            fn () => $booking?->property?->owner,
        );
    }

    /**
     * TCK-2658 (ADR-0105 § 3) — `include=reminders` : `last_reminder {at, source, channel, by}` et
     * `reminders_count` sur une ligne de bail, lus par la lecture unique des relances (notées et
     * automatiques) ; une réservation n'a pas de relance (`null`, 0).
     *
     * @param  Collection<int, array<string, mixed>>  $items
     * @param  EloquentCollection<int, LeasePayment>  $leasePayments
     * @return Collection<int, array<string, mixed>>
     */
    public function withReminders(?User $user, Collection $items, EloquentCollection $leasePayments): Collection
    {
        // Vérification adverse de TCK-2658 — les relances sont lues par la règle de
        // `LeasePaymentPolicy::remind` (super-admin, ou personnel de l'agence du bail), ligne par
        // ligne : `/lease-payments/{id}/reminders` refuse le bailleur et le locataire, cet include
        // ne leur rend pas davantage. L'agence de personnel se lit une fois pour la page.
        $seesAll = $user?->isSuperAdmin() === true;
        $staffAgencyId = $seesAll ? null : $user?->staffAgencyId();
        $leasePayments->loadMissing('lease:id,agency_id');
        $readable = $leasePayments
            ->filter(fn (LeasePayment $p): bool => $seesAll
                || ($staffAgencyId !== null && (int) $p->lease?->agency_id === $staffAgencyId))
            ->keyBy('id');

        $ids = $items->where('source', 'lease')->pluck('id')->filter(fn ($id) => $readable->has($id))->all();
        $summaries = $this->reminderReader->summaries($readable->only($ids)->values());

        return $items->map(fn (array $row) => $row + ($row['source'] === 'lease' && isset($summaries[$row['id']])
            ? $summaries[$row['id']]
            : ['last_reminder' => null, 'reminders_count' => 0]));
    }

    /**
     * Les relations demandées, et elles seules : un `include` absent ne charge ni n'émet rien.
     *
     * @param  list<string>  $includes
     * @param  callable(): (Customer|null)  $payer
     * @param  callable(): (Property|null)  $property
     * @param  callable(): (User|null)  $landlord
     * @return array<string, array<string, mixed>|null>
     */
    private function named(array $includes, callable $payer, callable $property, callable $landlord): array
    {
        $out = [];
        if (in_array('payer', $includes, true)) {
            $c = $payer();
            $out['payer'] = $c !== null ? ['id' => $c->id, 'name' => $c->full_name, 'phone' => $c->phone] : null;
        }
        if (in_array('property', $includes, true)) {
            $b = $property();
            $out['property'] = $b !== null ? ['id' => $b->id, 'title' => $b->title, 'reference_number' => $b->reference_number] : null;
        }
        if (in_array('landlord', $includes, true)) {
            $u = $landlord();
            $out['landlord'] = $u !== null ? ['id' => $u->id, 'name' => $u->full_name] : null;
        }

        return $out;
    }
}
