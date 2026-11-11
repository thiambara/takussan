<?php

namespace App\Services\Accounting;

use App\Models\Agency;
use App\Models\BankStatementLine;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Payments\PaymentGatewayService;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2674 — le rapprochement vu PAR PAIEMENT : ce que les passerelles ont déjà confirmé, et ce qui
 * reste à rapprocher à la main, sur les encaissements PAYÉS dans un mois (`paid_at`).
 *
 * Les payables lus sont les échéances de bail (cautions rendues exclues : une sortie) et les acomptes
 * de réservation, ceux qui ont une date de paiement. Une facture n'en a pas (`invoices` n'a pas de
 * `paid_at`) : elle reste rapprochable depuis le détail d'un relevé, comme les reversements.
 *
 * - **Confirmé automatiquement** : soldé par le webhook d'une passerelle — `metadata.gateway.settled_by`
 *   est une chaîne non vide différente de `manual` (l'identifiant de la transaction). Le fournisseur
 *   est celui de CETTE transaction ({@see self::providerSql()}).
 * - **À rapprocher** : payé sans passerelle (règlement saisi, ou aucune trace) et non rapproché
 *   (`bank_reconciled_at` nul). C'est la liste de {@see self::pendingPayments()}, et son compte.
 * - **Rapproché à la main** : payé sans passerelle, et rapproché.
 */
final class ReconciliationOverviewService
{
    public const PAYMENT_TYPES = [
        'lease_payment' => LeasePayment::class,
        'booking_payment' => BookingPayment::class,
    ];

    /** Les trois classes d'un paiement payé dans le mois ({@see self::paidInPeriod()}). */
    public const CONFIRMED_AUTOMATICALLY = 'confirmed_automatically';

    public const TO_RECONCILE = 'to_reconcile';

    public const RECONCILED_MANUALLY = 'reconciled_manually';

    /** Les statuts d'un relevé dont une ligne se confirme encore (`ReconciliationManager::confirmMatch`). */
    public const OPEN_STATEMENT_STATUSES = [BankStatementStatus::ReadyForReview, BankStatementStatus::PartiallyReconciled];

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} `[début inclus, fin exclue)` */
    public static function bounds(string $period): array
    {
        $start = CarbonImmutable::createFromFormat('!Y-m', $period);

        return [$start, $start->addMonth()];
    }

    /**
     * @return array{period: string, payments_total: int, confirmed_automatically: array{total: int, by_provider: array<string, int>|\stdClass}, to_reconcile: array{total: int, by_method: array<string, int>|\stdClass}, reconciled_manually: int}
     */
    public function overview(Agency $agency, string $period): array
    {
        $rows = DB::query()->fromSub($this->paidInPeriod($agency, $period), 'p')
            ->selectRaw('p.bucket, p.provider, p.payment_method, count(*) as n')
            ->groupBy('p.bucket', 'p.provider', 'p.payment_method')
            ->get();

        $byProvider = [];
        $byMethod = [];
        $reconciledManually = 0;
        foreach ($rows as $row) {
            $n = (int) $row->n;
            if ($row->bucket === self::CONFIRMED_AUTOMATICALLY) {
                $byProvider[$row->provider] = ($byProvider[$row->provider] ?? 0) + $n;
            } elseif ($row->bucket === self::RECONCILED_MANUALLY) {
                $reconciledManually += $n;
            } else {
                $method = $row->payment_method ?? 'unknown';
                $byMethod[$method] = ($byMethod[$method] ?? 0) + $n;
            }
        }
        arsort($byProvider);
        arsort($byMethod);

        return [
            'period' => $period,
            'payments_total' => (int) $rows->sum('n'),
            // Vide, un objet JSON (`{}`) et non une liste (`[]`) : la forme ne change pas avec les données.
            'confirmed_automatically' => ['total' => array_sum($byProvider), 'by_provider' => $byProvider ?: new \stdClass],
            'to_reconcile' => ['total' => array_sum($byMethod), 'by_method' => $byMethod ?: new \stdClass],
            'reconciled_manually' => $reconciledManually,
        ];
    }

    /**
     * Les paiements à rapprocher, du plus gros au plus petit, chacun avec la ligne proposée.
     *
     * @param  list<string>|null  $methods
     * @return array{paginator: LengthAwarePaginator, payments: Collection<int, Model>, suggestions: Collection<string, BankStatementLine>}
     */
    public function pendingPayments(Agency $agency, string $period, ?array $methods, ?bool $hasSuggestion, int $perPage): array
    {
        $query = DB::query()->fromSub($this->paidInPeriod($agency, $period), 'p')
            ->where('p.bucket', self::TO_RECONCILE)
            ->when($methods !== null, fn (QueryBuilder $q) => $q->whereIn('p.payment_method', $methods))
            ->when($hasSuggestion !== null, function (QueryBuilder $q) use ($agency, $hasSuggestion): void {
                $exists = $this->suggestedLines($agency)
                    ->whereColumn('bank_statement_lines.matched_payment_type', 'p.class')
                    ->whereColumn('bank_statement_lines.matched_payment_id', 'p.id')
                    ->whereColumn('bank_statement_lines.currency', 'p.currency')
                    ->toBase();
                $hasSuggestion ? $q->whereExists($exists) : $q->whereNotExists($exists);
            })
            ->select('p.type', 'p.class', 'p.id', 'p.amount')
            ->orderByDesc('p.amount')->orderBy('p.type')->orderBy('p.id');

        $paginator = $query->paginate($perPage);
        $payments = $this->hydrate(collect($paginator->items()));

        return ['paginator' => $paginator, 'payments' => $payments, 'suggestions' => $this->bestSuggestions($agency, $payments)];
    }

    /**
     * Les lignes proposées que `match` accepterait : un crédit `suggested` d'un relevé ouvert de
     * l'agence. La devise se compare au paiement par l'appelant. UNE définition, lue par le filtre
     * `has_suggestion` et par la ligne rendue.
     *
     * @return Builder<BankStatementLine>
     */
    public function suggestedLines(Agency $agency): Builder
    {
        return BankStatementLine::query()
            ->where('bank_statement_lines.match_status', BankStatementLineMatchStatus::Suggested->value)
            ->where('bank_statement_lines.direction', BankStatementLineDirection::Credit->value)
            ->whereHas('statement', fn (Builder $q) => $q
                ->where('agency_id', $agency->id)
                ->whereIn('status', array_map(fn (BankStatementStatus $s) => $s->value, self::OPEN_STATEMENT_STATUSES)));
    }

    /**
     * La meilleure ligne proposée de chaque paiement — confiance la plus haute, puis la plus
     * ancienne — indexée par `"<classe>:<id>"`.
     *
     * @param  Collection<int, Model>  $payments
     * @return Collection<string, BankStatementLine>
     */
    private function bestSuggestions(Agency $agency, Collection $payments): Collection
    {
        if ($payments->isEmpty()) {
            return collect();
        }

        $lines = $this->suggestedLines($agency)
            ->where(function (Builder $q) use ($payments): void {
                foreach ($payments->groupBy(fn (Model $p) => $p::class) as $class => $group) {
                    $q->orWhere(fn (Builder $inner) => $inner
                        ->where('bank_statement_lines.matched_payment_type', $class)
                        ->whereIn('bank_statement_lines.matched_payment_id', $group->map->getKey()->all()));
                }
            })
            ->orderByRaw('bank_statement_lines.match_confidence DESC NULLS LAST')
            ->orderBy('bank_statement_lines.id')
            ->get();

        $currencies = $payments->mapWithKeys(fn (Model $p) => [$p::class.':'.$p->getKey() => $this->currency($p)]);

        return $lines
            ->filter(fn (BankStatementLine $l) => $currencies->get($l->matched_payment_type.':'.$l->matched_payment_id) === $l->currency)
            ->groupBy(fn (BankStatementLine $l) => $l->matched_payment_type.':'.$l->matched_payment_id)
            ->map(fn (Collection $group) => $group->first());
    }

    /**
     * @param  Collection<int, object>  $rows
     * @return Collection<int, Model>
     */
    private function hydrate(Collection $rows): Collection
    {
        $loaded = collect();
        foreach ($rows->groupBy('class') as $class => $group) {
            /** @var class-string<Model> $class */
            $with = $class === LeasePayment::class ? ['payer', 'lease.property'] : ['payer', 'booking.property'];
            /** @var EloquentCollection<int, Model> $models */
            $models = $class::query()->with($with)->whereKey($group->pluck('id')->all())->get();
            foreach ($models as $model) {
                $loaded->put($class.':'.$model->getKey(), $model);
            }
        }

        return $rows->map(fn (object $row) => $loaded->get($row->class.':'.$row->id))->filter()->values();
    }

    private function currency(Model $payment): ?string
    {
        $currency = $payment->getAttribute('currency');

        return $currency instanceof \BackedEnum ? (string) $currency->value : $currency;
    }

    /**
     * Les encaissements payés dans le mois, une ligne par paiement : `type`, `class`, `id`, `amount`,
     * `currency`, `payment_method`, `provider` et `bucket` — le classement, écrit UNE fois ici et lu
     * par la synthèse comme par la liste.
     */
    private function paidInPeriod(Agency $agency, string $period): QueryBuilder
    {
        [$from, $to] = self::bounds($period);

        $lease = LeasePayment::query()
            ->whereHas('lease', fn (Builder $q) => $q->where('agency_id', $agency->id))
            ->exceptDepositRefunds();
        $booking = BookingPayment::query()
            ->whereHas('booking', fn (Builder $q) => $q->where('agency_id', $agency->id));

        $parts = [];
        foreach (['lease_payment' => $lease, 'booking_payment' => $booking] as $type => $query) {
            $table = $query->getModel()->getTable();
            $query->where("{$table}.status", PaymentStatus::Paid->value)
                ->where("{$table}.paid_at", '>=', $from)
                ->where("{$table}.paid_at", '<', $to);
            $parts[] = $query->toBase()->selectRaw(
                '? as type, ? as class, '.$table.'.id, '.$table.'.amount, '.$table.'.currency, '.$table.'.payment_method, '
                .self::providerSql($table).' as provider, '
                .'CASE WHEN '.self::gatewaySettledSql($table).' THEN ? '
                .'WHEN '.$table.'.bank_reconciled_at IS NOT NULL THEN ? ELSE ? END as bucket',
                [$type, self::PAYMENT_TYPES[$type], self::CONFIRMED_AUTOMATICALLY, self::RECONCILED_MANUALLY, self::TO_RECONCILE],
            );
        }

        return $parts[0]->unionAll($parts[1]);
    }

    /**
     * Soldé par le webhook d'une passerelle : `settled_by` est une chaîne non vide, autre que
     * `manual` (`PaymentGatewayService::SETTLED_MANUALLY`). Absent, nul ou vide : non.
     */
    public static function gatewaySettledSql(string $table): string
    {
        $settledBy = "({$table}.metadata->'gateway'->>'settled_by')";

        return "(jsonb_typeof({$table}.metadata->'gateway'->'settled_by') = 'string' AND {$settledBy} <> '' "
            ."AND {$settledBy} <> '".PaymentGatewayService::SETTLED_MANUALLY."') IS TRUE";
    }

    /**
     * Le fournisseur de la transaction qui a soldé : l'entrée de `gateway.transactions` qui porte
     * `settled_by` (un checkout ouvert ensuite change `gateway.provider`, pas l'argent reçu), à défaut
     * `gateway.provider`, à défaut le moyen de paiement.
     */
    public static function providerSql(string $table): string
    {
        $gateway = "({$table}.metadata->'gateway')";
        $entries = "jsonb_array_elements(CASE WHEN jsonb_typeof({$gateway}->'transactions') = 'array' "
            ."THEN {$gateway}->'transactions' ELSE '[]'::jsonb END) WITH ORDINALITY AS settling(v, n)";

        return "COALESCE((SELECT NULLIF(settling.v->>'provider', '') FROM {$entries} "
            ."WHERE settling.v->>'transaction_id' = {$gateway}->>'settled_by' ORDER BY settling.n LIMIT 1), "
            ."NULLIF({$gateway}->>'provider', ''), {$table}.payment_method, 'unknown')";
    }
}
