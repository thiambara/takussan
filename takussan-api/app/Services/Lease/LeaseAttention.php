<?php

namespace App\Services\Lease;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\TenantOnboardingChecklist;
use App\Models\User;
use App\Services\Dashboard\CollectedPayments;
use App\Services\Property\Occupation;
use App\Services\Reporting\OverdueInstalment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2642 — la file « À traiter » des baux : huit MOTIFS, chacun écrit UNE fois, en SQL.
 *
 * Chaque motif est une sous-requête scalaire corrélée à la ligne du bail, {@see self::since()} :
 * la date depuis laquelle le bail attend ce geste, `NULL` quand le motif ne vaut pas. Tout le reste
 * la lit — le filtre `filter[motif]` et `filter[a_traiter]` (« `since` n'est pas nul »), les comptes
 * de `GET /api/leases/summary`, le tri `sort=attention` et le bloc `attention[]` d'une page
 * ({@see self::attach()}, une requête pour la page) : une ligne ne peut pas porter un motif que le
 * filtre ne lui reconnaît pas.
 *
 * | motif | vaut quand | `since` |
 * |---|---|---|
 * | `signature_pending` | `pending_signature`, signature demandée il y a plus de 3 jours | la demande |
 * | `notice_received` | en cours et en préavis ({@see Occupation::onNotice()}) | la demande de préavis |
 * | `rent_late` | une échéance de LOYER due, non soldée, échue depuis plus que le délai de grâce du bail | l'échéance la plus ancienne |
 * | `late_fee_unpaid` | une échéance payée dont la pénalité n'est pas réglée ({@see CollectedPayments::lateFeesOutstanding()}) | la pénalité la plus ancienne |
 * | `rent_review_open` | `active`, un an passé depuis le début, aucune révision depuis 12 mois | le dernier anniversaire |
 * | `deposit_to_refund` | terminé ou expiré, caution restant à rendre > 0 ({@see DepositRemaining}) | la fin effective |
 * | `ending_soon` | `active`, fin dans moins de 4 mois, aucun renouvellement | l'entrée dans la fenêtre |
 * | `onboarding_incomplete` | entrée en attente ({@see TenantOnboardingChecklist::scopePending()}) | la création de la liste |
 *
 * `onboarding_incomplete` ne se lit que pour le PERSONNEL de l'agence du bail (et le super-admin) :
 * la file des entrées en attente est une file de relance interne, fermée au bailleur (TCK-378).
 * D'où l'instance par lecteur.
 */
final class LeaseAttention
{
    public const MOTIFS = [
        'signature_pending', 'notice_received', 'rent_late', 'late_fee_unpaid',
        'rent_review_open', 'deposit_to_refund', 'ending_soon', 'onboarding_incomplete',
    ];

    /**
     * La gravité de chaque motif, pour `sort=attention` (« danger d'abord, puis l'ancienneté ») :
     * 0 de l'argent dû, 1 un geste qui presse, 2 une information à traiter.
     */
    public const SEVERITY = [
        'rent_late' => 0, 'late_fee_unpaid' => 0,
        'signature_pending' => 1, 'deposit_to_refund' => 1, 'ending_soon' => 1, 'onboarding_incomplete' => 1,
        'notice_received' => 2, 'rent_review_open' => 2,
    ];

    public const SIGNATURE_AFTER_DAYS = 3;

    public const ENDING_WITHIN_MONTHS = 4;

    public const REVIEW_EVERY_MONTHS = 12;

    /** Les statuts qui rendent une caution, ceux de `DepositRefundService`. */
    public const DEPOSIT_REFUND_STATUSES = [LeaseStatus::Terminated, LeaseStatus::Expired];

    private readonly string $today;

    private readonly string $now;

    public function __construct(private readonly ?User $viewer)
    {
        $this->today = OverdueInstalment::today();
        $this->now = CarbonImmutable::now()->toDateTimeString();
    }

    public static function for(?User $viewer): self
    {
        return new self($viewer);
    }

    /** La date depuis laquelle le bail `$table` attend le motif, `NULL` sinon. */
    public function since(string $motif, string $table = 'leases'): string
    {
        $q = fn (string $date) => DB::connection()->getPdo()->quote($date);

        return match ($motif) {
            'signature_pending' => $this->onLease($table, fn (Builder $l) => $l
                ->where('att.status', LeaseStatus::PendingSignature->value)
                ->where('att.signature_requested_at', '<', CarbonImmutable::parse($this->now)->subDays(self::SIGNATURE_AFTER_DAYS)->toDateTimeString()),
                'att.signature_requested_at::date'),
            'notice_received' => $this->onLease($table, fn (Builder $l) => Occupation::onNotice(
                $l->whereIn('att.status', Lease::ONGOING_STATUSES), 'att'),
                'COALESCE(att.early_termination_requested_at, att.updated_at)::date'),
            'rent_late' => $this->scalar($this->latePayments($table)->selectRaw('MIN(lease_payments.due_date)')),
            'late_fee_unpaid' => $this->scalar($this->unpaidFees($table)
                ->selectRaw('MIN(COALESCE(lease_payments.late_fee_applied_at::date, lease_payments.due_date))')),
            'rent_review_open' => $this->onLease($table, fn (Builder $l) => $l
                ->where('att.status', LeaseStatus::Active->value)
                ->whereRaw('att.start_date + make_interval(months => ?) <= ?::date', [self::REVIEW_EVERY_MONTHS, $this->today])
                ->whereNotExists(fn ($a) => $a->from('activity_log')
                    ->where('activity_log.subject_type', (new Lease)->getMorphClass())
                    ->whereColumn('activity_log.subject_id', 'att.id')
                    ->where('activity_log.event', 'lease_rent_reviewed')
                    ->whereRaw('activity_log.created_at >= ?::date - make_interval(months => ?)', [$this->today, self::REVIEW_EVERY_MONTHS])),
                "(att.start_date + (EXTRACT(YEAR FROM age({$q($this->today)}::date, att.start_date))::int * interval '1 year'))::date"),
            'deposit_to_refund' => $this->onLease($table, fn (Builder $l) => $l
                ->whereIn('att.status', array_map(fn (LeaseStatus $s) => $s->value, self::DEPOSIT_REFUND_STATUSES))
                ->whereRaw(DepositRemaining::sql('att').' > 0'),
                'COALESCE(att.terminated_at::date, att.end_date)'),
            'ending_soon' => $this->onLease($table, fn (Builder $l) => $l
                ->where('att.status', LeaseStatus::Active->value)
                ->whereRaw('att.end_date >= ?::date', [$this->today])
                ->whereRaw('att.end_date < ?::date + make_interval(months => ?)', [$this->today, self::ENDING_WITHIN_MONTHS])
                ->whereNotExists(fn ($r) => $r->from('leases as ren')
                    ->whereColumn('ren.renewed_from_lease_id', 'att.id')
                    ->whereNull('ren.deleted_at')),
                '(att.end_date - make_interval(months => '.self::ENDING_WITHIN_MONTHS.'))::date'),
            'onboarding_incomplete' => $this->onboarding($table),
            default => throw new \InvalidArgumentException("Motif inconnu : {$motif}"),
        };
    }

    /** Le montant que le motif met en jeu (`rent_late`, `late_fee_unpaid`, `deposit_to_refund`), sinon `null`. */
    public function amount(string $motif, string $table = 'leases'): ?string
    {
        return match ($motif) {
            'rent_late' => $this->scalar($this->latePayments($table)->selectRaw('SUM('.CollectedPayments::OWED_REMAINING_SQL.')')),
            'late_fee_unpaid' => $this->scalar($this->unpaidFees($table)->selectRaw('SUM(lease_payments.late_fee_amount)')),
            'deposit_to_refund' => DepositRemaining::sql($table),
            default => null,
        };
    }

    /** L'échéance que le motif vise (la plus ancienne en retard, la fin du bail), sinon `null`. */
    public function dueDate(string $motif, string $table = 'leases'): ?string
    {
        return match ($motif) {
            'rent_late' => $this->scalar($this->latePayments($table)->selectRaw('MIN(lease_payments.due_date)')),
            'late_fee_unpaid' => $this->scalar($this->unpaidFees($table)->selectRaw('MIN(lease_payments.due_date)')),
            'ending_soon' => "{$table}.end_date",
            default => null,
        };
    }

    /**
     * @param  Builder<Lease>  $query
     * @return Builder<Lease>
     */
    public function whereMotif(Builder $query, string $motif): Builder
    {
        return $query->whereRaw('('.$this->since($motif, $query->getModel()->getTable()).') IS NOT NULL');
    }

    /**
     * Au moins un motif : la file « À traiter ».
     *
     * @param  Builder<Lease>  $query
     * @return Builder<Lease>
     */
    public function whereAny(Builder $query): Builder
    {
        $table = $query->getModel()->getTable();

        return $query->where(function (Builder $any) use ($table): void {
            foreach (self::MOTIFS as $motif) {
                $any->orWhereRaw('('.$this->since($motif, $table).') IS NOT NULL');
            }
        });
    }

    /**
     * `sort=attention` : la gravité la plus haute d'abord, puis le `since` le plus ancien de cette
     * gravité ; un bail sans motif en dernier. `-attention` renverse les deux clés.
     *
     * Les huit `since` sont lus UNE fois par ligne, par une jointure latérale (`att_sort`) : écrits
     * dans les deux `CASE`, ils étaient réévalués à chaque branche (11 s sur les 358 baux de la démo).
     * Le `SELECT` de la liste reste celui des seules colonnes du bail.
     *
     * @param  Builder<Lease>  $query
     */
    public function orderBy(Builder $query, bool $descending = false): void
    {
        $table = $query->getModel()->getTable();
        $columns = [];
        foreach (self::MOTIFS as $i => $motif) {
            $columns[] = "({$this->since($motif, $table)}) AS s{$i}";
        }
        $base = $query->getQuery();
        if ($base->columns === null) {
            $query->select("{$table}.*");
        }
        $query->leftJoinLateral('SELECT '.implode(', ', $columns), 'att_sort');

        $rank = 'CASE';
        $oldest = 'CASE';
        foreach ([0, 1, 2] as $severity) {
            $since = array_map(fn (string $m) => 'att_sort.s'.array_search($m, self::MOTIFS, true),
                array_keys(array_filter(self::SEVERITY, fn (int $s) => $s === $severity)));
            $present = implode(' OR ', array_map(fn (string $s) => "{$s} IS NOT NULL", $since));
            $rank .= " WHEN {$present} THEN {$severity}";
            $oldest .= " WHEN {$present} THEN LEAST(".implode(', ', $since).')';
        }
        $rank .= ' ELSE 3 END';
        $oldest .= ' END';

        $direction = $descending ? 'DESC' : 'ASC';
        $query->orderByRaw("{$rank} {$direction}")
            ->orderByRaw("{$oldest} {$direction} NULLS LAST");
    }

    /**
     * Pose `attention[]` sur chaque bail de la page, en UNE requête : pour chaque motif présent,
     * `{motif, since, amount?, due_date?}`, du plus grave au moins grave, puis du plus ancien.
     *
     * @param  Collection<int, Lease>  $leases
     */
    public function attach(Collection $leases): void
    {
        if ($leases->isEmpty()) {
            return;
        }

        $select = Lease::query()->withoutGlobalScopes()->whereIn('leases.id', $leases->map(fn (Lease $l) => $l->getKey())->all())->select('leases.id');
        foreach (self::MOTIFS as $i => $motif) {
            $select->selectRaw("({$this->since($motif)}) AS s{$i}");
            if (($amount = $this->amount($motif)) !== null) {
                $select->selectRaw("({$amount}) AS a{$i}");
            }
            if (($due = $this->dueDate($motif)) !== null) {
                $select->selectRaw("({$due}) AS d{$i}");
            }
        }
        $rows = $select->toBase()->get()->keyBy('id');

        foreach ($leases as $lease) {
            $row = (array) ($rows->get($lease->getKey()) ?? []);
            $entries = [];
            foreach (self::MOTIFS as $i => $motif) {
                if (($row["s{$i}"] ?? null) === null) {
                    continue;
                }
                $entries[] = array_filter([
                    'motif' => $motif,
                    'since' => CarbonImmutable::parse($row["s{$i}"]),
                    'amount' => array_key_exists("a{$i}", $row) ? round((float) $row["a{$i}"], 2) : null,
                    'due_date' => isset($row["d{$i}"]) ? CarbonImmutable::parse($row["d{$i}"]) : null,
                ], fn ($v) => $v !== null);
            }
            usort($entries, fn (array $a, array $b) => [self::SEVERITY[$a['motif']], $a['since']] <=> [self::SEVERITY[$b['motif']], $b['since']]);
            $lease->setAttentionBlock($entries);
        }
    }

    /**
     * Les échéances de loyer en retard du bail `$table` : dues et non soldées (la règle *Impayé*,
     * {@see CollectedPayments::leaseOwed()}), de LOYER, échues depuis plus que le délai de grâce du
     * bail (`late_fee_grace_days`, 0 s'il est nul — la règle de `LateFeeCalculator`).
     *
     * @return Builder<LeasePayment>
     */
    private function latePayments(string $table): Builder
    {
        return CollectedPayments::leaseOwed()
            ->where('lease_payments.payment_type', LeasePaymentType::Rent->value)
            ->whereRaw(CollectedPayments::OWED_REMAINING_SQL.' > 0')
            ->whereColumn('lease_payments.lease_id', "{$table}.id")
            ->whereRaw("lease_payments.due_date + COALESCE({$table}.late_fee_grace_days, 0) < ?::date", [$this->today]);
    }

    /**
     * Les pénalités à recouvrer ({@see CollectedPayments::lateFeesOutstanding()}) d'échéances PAYÉES :
     * celles d'une échéance encore due sont déjà dans `rent_late`.
     *
     * @return Builder<LeasePayment>
     */
    private function unpaidFees(string $table): Builder
    {
        return CollectedPayments::lateFeesOutstanding()
            ->where('lease_payments.status', PaymentStatus::Paid->value)
            ->whereColumn('lease_payments.lease_id', "{$table}.id");
    }

    private function onboarding(string $table): string
    {
        if ($this->viewer === null) {
            return 'NULL::date';
        }

        $pending = TenantOnboardingChecklist::query()->pending()
            ->whereColumn('tenant_onboarding_checklists.lease_id', "{$table}.id")
            ->selectRaw('MIN(tenant_onboarding_checklists.created_at)::date');
        if (! $this->viewer->isSuperAdmin()) {
            $staffAgencyId = $this->viewer->staffAgencyId();
            if ($staffAgencyId === null) {
                return 'NULL::date';
            }
            $pending->whereRaw("{$table}.agency_id = ?", [$staffAgencyId]);
        }

        return $this->scalar($pending);
    }

    /**
     * Une sous-requête sur la ligne même du bail (alias `att`), pour lire une règle écrite sur le
     * builder des baux (`Occupation::onNotice`) sans la recopier en chaîne.
     *
     * @param  callable(Builder<Lease>): mixed  $where
     */
    private function onLease(string $table, callable $where, string $since): string
    {
        $query = Lease::query()->withoutGlobalScopes()->from('leases as att')
            ->whereColumn('att.id', "{$table}.id")
            ->selectRaw($since);
        $where($query);

        return $this->scalar($query);
    }

    /** @param  Builder<covariant \Illuminate\Database\Eloquent\Model>  $query */
    private function scalar(Builder $query): string
    {
        return '('.$query->toRawSql().')';
    }
}
