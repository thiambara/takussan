<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Dashboard\PortfolioMetrics;
use App\Services\Payments\RentMonthStatus;
use App\Services\Reporting\OverdueInstalment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance d'un bailleur, dans une agence, pour un mois
 * (`YYYY-MM`) ou une année (`YYYY`, l'attestation annuelle).
 *
 * Il se lit sur les MÊMES règles que la préparation ({@see PayoutCalculator}) : encaissements
 * éligibles de la période (`paid_at`), commission ligne par ligne ; les frais sont les factures
 * d'intervention imputées aux reversements versés dans la période (`processed_at`, P177.03), et le
 * versé se lit sur ces mêmes reversements. La liste cite aussi les reversements qui portent un
 * encaissement de la période, marqués `paid_in_period` quand ils ont été versés dans la période.
 * Il ne lit que `payee_role = landlord` : la caution rendue
 * au locataire n'est pas un reversement au bailleur.
 */
final class OwnerStatementService
{
    /** TCK-2649 — un bail qui a occupé le bien : ni brouillon, ni en attente de signature. */
    private const OCCUPYING_STATUSES = [
        LeaseStatus::Active->value, LeaseStatus::Terminating->value, LeaseStatus::Expired->value,
        LeaseStatus::Terminated->value, LeaseStatus::Renewed->value,
    ];

    /**
     * TCK-2760 (ADR-0100, amendement du 2026-11-12) — le premier jour de la fenêtre du solde
     * cumulé ({@see self::balances()}) : antérieur à toute donnée, la plateforme n'a rien encaissé
     * avant.
     */
    public const BALANCE_ORIGIN = '2000-01-01';

    public function __construct(
        private readonly PayoutCalculator $calculator,
        private readonly PayoutClawbacks $clawbacks,
    ) {}

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable, 2: bool} début, fin, annuel */
    public static function period(string $period): array
    {
        if (preg_match('/^\d{4}$/', $period) === 1) {
            $start = CarbonImmutable::create((int) $period, 1, 1)->startOfDay();

            return [$start, $start->endOfYear(), true];
        }

        $start = CarbonImmutable::createFromFormat('!Y-m', $period)->startOfMonth();

        return [$start, $start->endOfMonth(), false];
    }

    /**
     * TCK-2760 — `balance` (le solde cumulé au jour, {@see self::balance()}) ne dépend pas de la
     * période. `$withBalance` faux l'omet : l'instantané envoyé ne le garde pas
     * ({@see OwnerStatementSnapshots::record()}), et n'a donc pas à le calculer.
     *
     * @return array<string, mixed>
     */
    public function statement(Agency $agency, User $landlord, string $period, bool $withBalance = true): array
    {
        [$start, $end, $annual] = self::period($period);

        [
            'computation' => $computation,
            'carrying' => $carrying,
            'paid' => $paid,
            'totals' => $totals,
        ] = $this->figures($agency, [(int) $landlord->id], $start, $end)[(int) $landlord->id];
        $paidIds = $paid->pluck('id')->all();
        $payouts = $carrying->concat($paid)->unique('id')->sortBy('id')->values();

        return [
            'agency' => ['id' => $agency->id, 'name' => $agency->name],
            // P234.06 (TCK-2315) — la raison sociale d'un bailleur société, `null` pour un particulier.
            'landlord' => [
                'id' => $landlord->id,
                // P235.02 (TCK-2369) — nom, puis `username`, puis « — » : jamais `''` ni `null` pour un compte sans nom.
                'name' => $landlord->nameWithoutContact(),
                'company_name' => OwnerProfile::companyNameOf((int) $landlord->id, (int) $agency->id),
            ],
            'period' => $period,
            'annual' => $annual,
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'currency' => $computation['currency'],
            'totals' => $totals,
            // TCK-2760 — le solde cumulé au jour, à côté des totaux de la période.
        ] + ($withBalance ? ['balance' => $this->balance($agency, $landlord)] : []) + [
            'next_payout' => $this->nextPayout($agency, $landlord),
            'properties' => $this->properties($agency, $landlord, $start, $end, $this->byProperty($computation['lines'])),
            'lines' => $computation['lines'],
            'payouts' => $payouts->map(fn (Payout $p): array => [
                'id' => $p->id,
                'reference_number' => $p->reference_number,
                'status' => $p->status?->value,
                'net_amount' => (float) $p->net_amount,
                'clawback_amount' => $p->clawback_amount !== null ? (float) $p->clawback_amount : null,
                'transaction_id' => $p->transaction_id,
                'processed_at' => $p->processed_at?->toIso8601String(),
                'paid_in_period' => in_array($p->id, $paidIds, true),
            ])->values()->all(),
            'unpaid' => $this->unpaid($agency, $landlord, $start, $end),
            'late_fees_outstanding' => $this->lateFeesOutstanding($agency, $landlord, $start, $end),
        ];
    }

    /**
     * TCK-2640 — les totaux du relevé de plusieurs bailleurs d'une agence pour une période, en un
     * nombre de requêtes qui ne dépend pas du nombre de bailleurs : la liste des bailleurs les lit
     * pour sa page entière. Ce sont les totaux de {@see self::statement()}, calculés par le MÊME
     * chemin ({@see self::figures()}) — jamais une seconde règle. Un bailleur sans rien rend des
     * totaux à zéro.
     *
     * @param  list<int>  $landlordIds
     * @return array<int, array<string, float>> par bailleur
     */
    public function totalsFor(Agency $agency, array $landlordIds, string $period): array
    {
        [$start, $end] = self::period($period);

        return array_map(fn (array $f): array => $f['totals'], $this->figures($agency, $landlordIds, $start, $end));
    }

    /**
     * TCK-2760 (ADR-0100, amendement du 2026-11-12, décision 4 (a) du porteur) — le reste à verser
     * au bailleur est un SOLDE CUMULÉ arrêté au jour : ce que l'agence lui doit aujourd'hui, qu'elle
     * verse dans le mois ou le mois suivant. C'est {@see self::remainingToPay()} appliqué aux totaux
     * de {@see self::figures()} sur la fenêtre [{@see self::BALANCE_ORIGIN}, aujourd'hui à Dakar] —
     * le même calcul que le reste d'une période, jamais une seconde formule : la somme des restes
     * mensuels rejoint donc le solde. Il ne dépend d'aucune période, se lit dans l'agence du relevé,
     * et garde son signe (négatif s'il a été trop versé). Une reprise s'annule dans `net − paid_out`
     * (le versé la compte avant reprise) : imputée ou non, elle ne change pas le solde.
     *
     * Plusieurs bailleurs en un nombre de requêtes qui ne dépend pas de leur nombre, comme
     * {@see self::totalsFor()} : le carnet le lit pour son périmètre entier.
     *
     * @param  list<int>  $landlordIds
     * @return array<int, array{remaining_to_pay: float, as_of: string}> par bailleur
     */
    public function balances(Agency $agency, array $landlordIds): array
    {
        $today = now(OverdueInstalment::TIMEZONE)->toDateString();
        $start = CarbonImmutable::parse(self::BALANCE_ORIGIN)->startOfDay();
        $end = CarbonImmutable::parse($today)->endOfDay();

        return array_map(fn (array $f): array => [
            'remaining_to_pay' => (float) $f['totals']['remaining_to_pay'],
            'as_of' => $today,
        ], $this->figures($agency, $landlordIds, $start, $end));
    }

    /**
     * TCK-2760 — le solde cumulé au jour d'un bailleur ({@see self::balances()}).
     *
     * @return array{remaining_to_pay: float, as_of: string}
     */
    public function balance(Agency $agency, User $landlord): array
    {
        return $this->balances($agency, [(int) $landlord->id])[(int) $landlord->id];
    }

    /**
     * Le cœur du relevé, pour un bailleur ou plusieurs : les pièces de la période, les reversements
     * qui les portent et ceux versés dans la période, les frais, la reprise, puis le calcul de
     * {@see PayoutCalculator::compute()} bailleur par bailleur — chacun sur SES pièces et SES
     * reversements, exactement comme s'il était seul.
     *
     * @param  list<int>  $landlordIds
     * @return array<int, array{computation: array<string, mixed>, carrying: Collection<int, Payout>, paid: Collection<int, Payout>, totals: array<string, float>}>
     */
    private function figures(Agency $agency, array $landlordIds, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $ids = array_values(array_unique(array_map('intval', $landlordIds)));
        if ($ids === []) {
            return [];
        }
        $agencyId = (int) $agency->id;

        // TCK-2151 (P177.01) — une pièce d'un reversement versé se lit par sa copie, quel que soit son
        // statut du jour : le mois versé ne change plus quand elle est remboursée ensuite.
        $leasePayments = $this->calculator->leasePayments($agencyId, $ids, $start, $end, false, true)->get();
        $bookingPayments = $this->calculator->bookingPayments($agencyId, $ids, $start, $end, false, true)->get();
        // Le bailleur d'un acompte est le titulaire du bien de sa réservation (la jointure du calcul).
        $bookingLandlords = Property::withTrashed()
            ->whereIn('id', $bookingPayments->map(fn (BookingPayment $p) => $p->booking?->property_id)->filter()->unique()->values())
            ->pluck('user_id', 'id');
        $bookingPayments = $bookingPayments->groupBy(fn (BookingPayment $p) => (int) ($bookingLandlords[$p->booking?->property_id] ?? 0));

        // P206.01 — la pénalité réglée dans la période, reversée ou non, comme les pièces.
        $lateFees = $this->calculator->lateFees($agencyId, $ids, $start, $end, false)->get();
        // Le bailleur d'une pièce de loyer est celui de son bail — lu avec les baux supprimés, que la
        // jointure du calcul garde aussi (leur pièce n'a plus de relation `lease` chargée).
        $leaseLandlords = Lease::withTrashed()
            ->whereIn('id', $leasePayments->concat($lateFees)->pluck('lease_id')->unique()->values())
            ->pluck('landlord_id', 'id');
        $leasePayments = $leasePayments->groupBy(fn (LeasePayment $p) => (int) ($leaseLandlords[$p->lease_id] ?? 0));
        $lateFees = $lateFees->groupBy(fn (LeasePayment $p) => (int) ($leaseLandlords[$p->lease_id] ?? 0));

        $carrying = $this->payoutsCarrying($agencyId, $ids, $leasePayments, $bookingPayments, $lateFees);
        // P177.03 (TCK-2041) — le versé et les frais vont au mois de `processed_at`, comme le « net
        // reversé » du tableau de bord ({@see PortfolioMetrics::netPaidOutByMonth()}) : un reversement
        // qui porte des pièces de plusieurs mois n'est compté, frais compris, que dans le mois où il
        // a été versé, et la somme des mois rejoint l'année. Brut et commission restent ventilés par
        // pièce de la période. Les frais d'un reversement pas encore versé n'entrent dans aucun mois.
        $paid = $this->payoutsPaidIn($agencyId, $ids, $start, $end)->groupBy(fn (Payout $p) => (int) $p->landlord_id);
        $bills = ServiceProviderBill::query()
            ->whereIn('imputed_payout_id', $paid->flatten()->pluck('id')->all())
            ->orderBy('id')
            ->get()
            ->groupBy(fn (ServiceProviderBill $b) => (int) $b->imputed_payout_id);
        $pivots = $this->pivotsOf($carrying->flatten());

        // TCK-2151 (P205.01, P205.03 ; ADR-0039, amendement du 2026-10-24, point 4) — la reprise est
        // la seule ligne négative d'un remboursement, au mois du remboursement : elle diminue le net
        // dû et le versé. Le reversement qui l'impute compte au versé AVANT reprise.
        $clawbacks = $this->clawbacks->datedIn('landlord_id', $ids, $start, $end, $agencyId)
            ->groupBy(fn (object $c) => (int) $c->landlord_id);

        $figures = [];
        foreach ($ids as $id) {
            $ownCarrying = $carrying->get($id, collect());
            $ownPaid = $paid->get($id, collect());
            $ownLateFees = $lateFees->get($id, collect());
            $ownBills = $ownPaid->flatMap(fn (Payout $p) => $bills->get((int) $p->id, collect()))->sortBy('id')->values();
            $ownClawbacks = $clawbacks->get($id, collect());

            $computation = $this->calculator->compute(
                $agency,
                $leasePayments->get($id, collect()),
                $bookingPayments->get($id, collect()),
                $ownBills,
                $this->retainedRates($pivots, $ownCarrying, $ownLateFees),
                $ownLateFees,
                $this->retainedAmounts($pivots, $ownCarrying),
            );

            $clawedBack = round((float) $ownClawbacks->sum(fn (object $c) => (float) $c->amount), 2);
            $computation['lines']['clawbacks'] = $ownClawbacks->map(fn (object $c): array => [
                'id' => (int) $c->id,
                'source_payout_id' => (int) $c->source_payout_id,
                'refunded_at' => CarbonImmutable::parse($c->refunded_at)->toIso8601String(),
                'refund_amount' => (float) $c->refund_amount,
                'commission_rate' => (float) $c->commission_rate,
                'commission' => (float) $c->commission_amount,
                'amount' => -(float) $c->amount,
            ])->values()->all();

            $totals = array_merge($computation['totals'], [
                'net' => round($computation['totals']['net'] - $clawedBack, 2),
                'clawback' => $clawedBack,
                'paid_out' => round((float) $ownPaid->sum(fn (Payout $p) => (float) $p->net_amount + (float) ($p->clawback_amount ?? 0)) - $clawedBack, 2),
            ]);
            // TCK-2649 (ADR-0100) — le reste à verser, calculé ICI et une seule fois : la fiche
            // bailleur et la page « Loyers » le lisent, jamais une soustraction côté front. Négatif
            // s'il a été trop versé, rendu tel quel (la reprise suit ADR-0039).
            $totals['remaining_to_pay'] = self::remainingToPay($totals);

            $figures[$id] = ['computation' => $computation, 'carrying' => $ownCarrying, 'paid' => $ownPaid, 'totals' => $totals];
        }

        return $figures;
    }

    /**
     * TCK-2649 — `net − paid_out`, au centime. Public pour l'instantané d'avant ce champ
     * ({@see OwnerStatementSnapshots::served()}), qui le recompose sur ses propres totaux.
     *
     * TCK-2760 — sur les totaux d'une PÉRIODE, c'est l'écart du mois (`totals.remaining_to_pay`) ;
     * sur la fenêtre cumulée, c'est le solde au jour ({@see self::balances()}). Une seule formule.
     *
     * @param  array<string, mixed>  $totals
     */
    public static function remainingToPay(array $totals): float
    {
        return round((float) ($totals['net'] ?? 0) - (float) ($totals['paid_out'] ?? 0), 2);
    }

    /**
     * TCK-2649 — le prochain reversement AU BAILLEUR encore à venir ({@see PayoutStatus::upcoming()}),
     * le plus tôt programmé d'abord ; un reversement sans date passe après. Lu au jour, quelle que
     * soit la période : c'est un « prochain », pas un fait du mois.
     *
     * @return array{id: int, scheduled_at: ?string, payment_method: ?string, status: ?string, net_amount: float}|null
     */
    public function nextPayout(Agency $agency, User $landlord): ?array
    {
        $payout = Payout::query()
            ->where('agency_id', $agency->id)
            ->where('landlord_id', $landlord->id)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::upcoming()))
            ->orderByRaw('scheduled_at ASC NULLS LAST')
            ->orderBy('id')
            ->first();

        return $payout === null ? null : [
            'id' => (int) $payout->id,
            'scheduled_at' => $payout->scheduled_at?->toIso8601String(),
            'payment_method' => $payout->payment_method?->value,
            'status' => $payout->status?->value,
            'net_amount' => (float) $payout->net_amount,
        ];
    }

    /**
     * TCK-2649 — la ligne de chaque bien du bailleur dans l'agence : ceux qui ont bougé dans la
     * période (les lignes de {@see self::byProperty()}, en tête et dans leur ordre, chiffres
     * inchangés), puis ceux qui n'ont rien encaissé — un bien vacant ou en retard est justement
     * celui dont le bailleur veut la ligne. `has_movements` les distingue : le PDF n'imprime que
     * les premiers, comme avant.
     *
     * Chaque ligne gagne `title`, `tenant_name` (le locataire du bail le plus récent qui court sur
     * la période ; le relevé ne porte que les biens de CE bailleur, et ne s'ouvre qu'à lui et au
     * personnel de l'agence — `OwnerStatementPolicy`), `expected_rent` (les échéances de loyer non
     * annulées dues dans la période), `month_status` et `days_late` ({@see self::monthStatus()}).
     *
     * @param  list<array<string, mixed>>  $moved
     * @return list<array<string, mixed>>
     */
    private function properties(Agency $agency, User $landlord, CarbonImmutable $start, CarbonImmutable $end, array $moved): array
    {
        $leases = Lease::query()
            ->where('agency_id', $agency->id)
            ->where('landlord_id', $landlord->id)
            ->whereIn('status', self::OCCUPYING_STATUSES)
            ->whereDate('start_date', '<=', $end->toDateString())
            ->with('tenant')
            ->orderByDesc('start_date')
            ->orderByDesc('id')
            ->get()
            ->filter(fn (Lease $lease) => ($ends = self::effectiveEnd($lease)) === null || $ends >= $start->toDateString())
            ->groupBy('property_id');

        $dues = LeasePayment::query()
            ->select('lease_payments.*', 'leases.property_id AS statement_property_id')
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.agency_id', $agency->id)
            ->where('leases.landlord_id', $landlord->id)
            ->where('lease_payments.payment_type', LeasePaymentType::Rent->value)
            ->where('lease_payments.status', '!=', PaymentStatus::Cancelled->value)
            ->whereBetween('lease_payments.due_date', [$start->toDateString(), $end->toDateString()])
            ->get()
            ->groupBy('statement_property_id');

        // Un bien archivé avant la période n'a plus de ligne, sauf s'il a encore un bail ou une échéance.
        $owned = Property::query()
            ->where('agency_id', $agency->id)
            ->where('user_id', $landlord->id)
            ->where(fn ($q) => $q->whereNull('archived_at')->orWhere('archived_at', '>=', $start->startOfDay()))
            ->orderBy('id')
            ->pluck('id')
            ->all();

        $rows = array_map(fn (array $row): array => $row + ['has_movements' => true], $moved);
        $seen = array_column($rows, 'property_id');
        $others = array_values(array_diff(array_unique([...$owned, ...$leases->keys()->all(), ...$dues->keys()->all()]), $seen));
        sort($others);
        foreach ($others as $id) {
            $rows[] = ['property_id' => (int) $id, 'collected' => 0.0, 'commission' => 0.0, 'fees' => 0.0, 'net' => 0.0, 'has_movements' => false];
        }

        $titles = Property::withTrashed()->whereIn('id', array_column($rows, 'property_id'))->pluck('title', 'id');

        return array_map(function (array $row) use ($leases, $dues, $titles): array {
            $id = $row['property_id'];
            /** @var Collection<int, Lease> $propertyLeases */
            $propertyLeases = $leases->get($id, collect());
            $lease = $propertyLeases->first(fn (Lease $l) => in_array($l->status?->value, Lease::ONGOING_STATUSES, true)) ?? $propertyLeases->first();
            /** @var Collection<int, LeasePayment> $propertyDues */
            $propertyDues = $dues->get($id, collect());

            return $row + [
                'title' => $titles[$id] ?? null,
                'tenant_name' => trim((string) $lease?->tenant?->full_name) ?: null,
                'expected_rent' => round((float) $propertyDues->sum(fn (LeasePayment $p) => (float) $p->amount), 2),
                ...self::monthStatus($propertyDues, $lease !== null),
            ];
        }, $rows);
    }

    /** Le dernier jour d'occupation d'un bail : la sortie anticipée, sinon la résiliation, sinon le terme. */
    private static function effectiveEnd(Lease $lease): ?string
    {
        return $lease->early_termination_effective_date?->toDateString()
            ?? ($lease->status === LeaseStatus::Terminated ? $lease->terminated_at?->toDateString() : null)
            ?? $lease->end_date?->toDateString();
    }

    /**
     * TCK-2649 — l'état du loyer d'un bien sur la période, sur ses échéances de loyer non annulées.
     * TCK-2637 — la règle vit dans {@see RentMonthStatus::of()}, que lit aussi l'occupation d'un
     * bien (`current_month`) : une seule définition.
     *
     * @param  Collection<int, LeasePayment>  $dues
     * @return array{month_status: string, days_late: ?int}
     */
    private static function monthStatus(Collection $dues, bool $occupied): array
    {
        return RentMonthStatus::of($dues, $occupied);
    }

    /**
     * Les reversements AU BAILLEUR (jamais annulés ni échoués : ceux-là ont rendu leurs pièces) qui
     * portent au moins un encaissement de la période — de CE bailleur : un reversement d'un autre
     * qui porterait sa pièce (bien transféré, TCK-999) n'est pas le sien. Rangés par bailleur.
     *
     * @param  list<int>  $ids
     * @param  Collection<int, Collection<int, LeasePayment>>  $leasePayments
     * @param  Collection<int, Collection<int, BookingPayment>>  $bookingPayments
     * @param  Collection<int, Collection<int, LeasePayment>>  $lateFees  P206.01 — une pénalité reversée porte son reversement
     * @return Collection<int, Collection<int, Payout>>
     */
    private function payoutsCarrying(int $agencyId, array $ids, Collection $leasePayments, Collection $bookingPayments, Collection $lateFees): Collection
    {
        $leaseIds = $leasePayments->flatten()->pluck('id')->all();
        $bookingIds = $bookingPayments->flatten()->pluck('id')->all();
        $lateFeePayoutIds = $lateFees->flatten()->pluck('late_fee_payout_id')->filter()->unique()->values()->all();

        $candidates = Payout::query()
            ->where('agency_id', $agencyId)
            ->whereIn('landlord_id', $ids)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, PayoutStatus::holdingItems()))
            ->where(function ($q) use ($leaseIds, $bookingIds, $lateFeePayoutIds): void {
                $q->whereIn('id', DB::table('payout_lease_payment')->whereIn('lease_payment_id', $leaseIds ?: [0])->select('payout_id'))
                    ->orWhereIn('id', DB::table('payout_booking_payment')->whereIn('booking_payment_id', $bookingIds ?: [0])->select('payout_id'))
                    ->orWhereIn('id', $lateFeePayoutIds ?: [0]);
            })
            ->orderBy('id')
            ->get();
        if ($candidates->isEmpty()) {
            return collect();
        }

        $candidateIds = $candidates->pluck('id')->all();
        $leaseCarried = DB::table('payout_lease_payment')->whereIn('payout_id', $candidateIds)->whereIn('lease_payment_id', $leaseIds ?: [0])
            ->get(['payout_id', 'lease_payment_id'])->groupBy('payout_id');
        $bookingCarried = DB::table('payout_booking_payment')->whereIn('payout_id', $candidateIds)->whereIn('booking_payment_id', $bookingIds ?: [0])
            ->get(['payout_id', 'booking_payment_id'])->groupBy('payout_id');

        $carrying = collect();
        foreach ($ids as $id) {
            $ownLease = $leasePayments->get($id, collect())->pluck('id')->flip();
            $ownBooking = $bookingPayments->get($id, collect())->pluck('id')->flip();
            $ownFeePayouts = $lateFees->get($id, collect())->pluck('late_fee_payout_id')->filter()->flip();
            $own = $candidates->filter(fn (Payout $p) => (int) $p->landlord_id === $id && (
                $leaseCarried->get($p->id, collect())->contains(fn (object $r) => $ownLease->has($r->lease_payment_id))
                || $bookingCarried->get($p->id, collect())->contains(fn (object $r) => $ownBooking->has($r->booking_payment_id))
                || $ownFeePayouts->has($p->id)
            ))->values();
            if ($own->isNotEmpty()) {
                $carrying->put($id, $own);
            }
        }

        return $carrying;
    }

    /**
     * P177.03 (TCK-2041) — les reversements AU BAILLEUR versés (`completed`) dans la période, par
     * `processed_at`, la règle de {@see PortfolioMetrics::netPaidOutByMonth()}.
     *
     * @param  list<int>  $ids
     * @return Collection<int, Payout>
     */
    private function payoutsPaidIn(int $agencyId, array $ids, CarbonImmutable $start, CarbonImmutable $end): Collection
    {
        return Payout::query()
            ->where('agency_id', $agencyId)
            ->whereIn('landlord_id', $ids)
            ->where('payee_role', PayeeRole::Landlord->value)
            ->where('status', PayoutStatus::Completed->value)
            ->whereBetween('processed_at', [$start->startOfDay(), $end->endOfDay()])
            ->orderBy('id')
            ->get();
    }

    /**
     * Les lignes de pivot des reversements cités : le taux et le montant que chacun a copiés sur
     * ses pièces (TCK-2017), en une lecture par pivot pour tous les bailleurs.
     *
     * @param  Collection<int, Payout>  $payouts
     * @return array{lease_payments: Collection<int, object>, booking_payments: Collection<int, object>}
     */
    private function pivotsOf(Collection $payouts): array
    {
        $ids = $payouts->pluck('id')->unique()->values()->all();
        $pivots = [];
        foreach (['lease_payments' => ['payout_lease_payment', 'lease_payment_id'], 'booking_payments' => ['payout_booking_payment', 'booking_payment_id']] as $set => [$pivot, $column]) {
            $pivots[$set] = $ids === [] ? collect() : DB::table($pivot)
                ->whereIn('payout_id', $ids)
                ->orderBy('payout_id')
                ->get(['payout_id', $column.' AS item_id', 'commission_rate', 'amount']);
        }

        return $pivots;
    }

    /**
     * P177.02 (TCK-2017) — le taux que chaque reversement a appliqué à ses pièces, copié dans le pivot à
     * sa création : la commission d'un mois reversé ne se recalcule pas au taux d'agence du jour. Une
     * ligne de pivot sans copie (antérieure à la copie) n'y figure pas, et suit le taux du jour.
     * Seuls les reversements de CE bailleur comptent.
     *
     * P206.01 — la pénalité reversée garde de même le taux copié sur sa ligne
     * (`late_fee_payout_commission_rate`).
     *
     * @param  array{lease_payments: Collection<int, object>, booking_payments: Collection<int, object>}  $pivots
     * @param  Collection<int, Payout>  $payouts
     * @param  Collection<int, LeasePayment>  $lateFees
     * @return array{lease_payments: array<int, float>, booking_payments: array<int, float>, late_fees: array<int, float>}
     */
    private function retainedRates(array $pivots, Collection $payouts, Collection $lateFees): array
    {
        $own = $payouts->pluck('id')->flip();
        $rates = [];
        foreach (['lease_payments', 'booking_payments'] as $set) {
            $rates[$set] = $pivots[$set]
                ->filter(fn (object $r) => $own->has($r->payout_id) && $r->commission_rate !== null)
                ->mapWithKeys(fn (object $r): array => [(int) $r->item_id => (float) $r->commission_rate])
                ->all();
        }

        $rates['late_fees'] = $lateFees
            ->filter(fn (LeasePayment $fee): bool => $fee->late_fee_payout_id !== null && $fee->late_fee_payout_commission_rate !== null)
            ->mapWithKeys(fn (LeasePayment $fee): array => [(int) $fee->id => (float) $fee->late_fee_payout_commission_rate])
            ->all();

        return $rates;
    }

    /**
     * TCK-2151 (P177.01) — le montant que chaque reversement VERSÉ a pris de ses pièces, copié dans
     * le pivot à sa création (TCK-2017). Une ligne sans copie n'y figure pas, et se lit au jour.
     *
     * @param  array{lease_payments: Collection<int, object>, booking_payments: Collection<int, object>}  $pivots
     * @param  Collection<int, Payout>  $payouts
     * @return array{lease_payments: array<int, float>, booking_payments: array<int, float>}
     */
    private function retainedAmounts(array $pivots, Collection $payouts): array
    {
        $completed = $payouts->filter(fn (Payout $p) => $p->status === PayoutStatus::Completed)->pluck('id')->flip();
        $amounts = [];
        foreach (['lease_payments', 'booking_payments'] as $set) {
            $amounts[$set] = $pivots[$set]
                ->filter(fn (object $r) => $completed->has($r->payout_id) && $r->amount !== null)
                ->mapWithKeys(fn (object $r): array => [(int) $r->item_id => (float) $r->amount])
                ->all();
        }

        return $amounts;
    }

    /**
     * @param  array<string, list<array<string, mixed>>>  $lines
     * @return list<array<string, mixed>>
     */
    private function byProperty(array $lines): array
    {
        $rows = [];
        foreach (['lease_payments', 'booking_payments', 'late_fees'] as $set) {
            foreach ($lines[$set] as $line) {
                $id = $line['property_id'];
                $rows[$id] ??= ['property_id' => $id, 'collected' => 0.0, 'commission' => 0.0, 'fees' => 0.0];
                $rows[$id]['collected'] += $line['amount'];
                $rows[$id]['commission'] += $line['commission'];
            }
        }
        foreach ($lines['service_provider_bills'] as $line) {
            $id = $line['property_id'];
            $rows[$id] ??= ['property_id' => $id, 'collected' => 0.0, 'commission' => 0.0, 'fees' => 0.0];
            $rows[$id]['fees'] += $line['amount'];
        }

        return array_values(array_map(fn (array $r): array => $r + [
            'net' => $r['collected'] - $r['commission'] - $r['fees'],
        ], $rows));
    }

    /**
     * P206.03 (ADR-0057, amendement du 2026-10-24, point 3) — les pénalités à recouvrer des échéances
     * de la période, à part de l'impayé, qui ne les compte pas. Mêmes baux et mêmes types que
     * {@see self::unpaid()}.
     *
     * @return array{count: int, amount: float}
     */
    private function lateFeesOutstanding(Agency $agency, User $landlord, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $row = CollectedPayments::lateFeesOutstanding()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.agency_id', $agency->id)
            ->where('leases.landlord_id', $landlord->id)
            ->whereIn('lease_payments.payment_type', array_map(fn (LeasePaymentType $t) => $t->value, PayoutCalculator::LEASE_TYPES))
            ->whereBetween('lease_payments.due_date', [$start->toDateString(), $end->toDateString()])
            ->toBase()
            ->selectRaw('COUNT(*) AS n, COALESCE(SUM('.CollectedPayments::LATE_FEE_OUTSTANDING_SQL.'), 0) AS total')
            ->first();

        return ['count' => (int) ($row->n ?? 0), 'amount' => round((float) ($row->total ?? 0), 2)];
    }

    /**
     * Les loyers échus dans la période et non encaissés. « Échu » = dû avant aujourd'hui, et un bail
     * supprimé ne compte pas : les deux règles de {@see PortfolioMetrics::overdue()}
     * (P93.02, TCK-1175). Les types restent ceux du relevé ({@see PayoutCalculator::LEASE_TYPES}).
     *
     * @return array{as_of: string, count: int, amount: float}
     */
    private function unpaid(Agency $agency, User $landlord, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $query = CollectedPayments::leaseOwed()
            ->join('leases', 'leases.id', '=', 'lease_payments.lease_id')
            ->whereNull('leases.deleted_at')
            ->where('leases.agency_id', $agency->id)
            ->where('leases.landlord_id', $landlord->id)
            ->whereIn('lease_payments.payment_type', array_map(fn (LeasePaymentType $t) => $t->value, PayoutCalculator::LEASE_TYPES))
            ->whereBetween('lease_payments.due_date', [$start->toDateString(), $end->toDateString()])
            ->whereDate('lease_payments.due_date', '<', now()->toDateString());

        return [
            // P177.06 (TCK-1785) — le jour où « échu » a été jugé : un mois passé voit ses impayés
            // baisser à mesure que les loyers se règlent, le relevé dit donc à quelle date il les lit.
            'as_of' => now()->toDateString(),
            'count' => (clone $query)->count(),
            // verif-595 passe 2 — le reste dû, la règle des tuiles Impayés et de la balance âgée.
            'amount' => round((float) $query->sum(DB::raw(CollectedPayments::OWED_REMAINING_SQL)), 2),
        ];
    }
}
