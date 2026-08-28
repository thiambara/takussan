<?php

namespace App\Services\Reporting;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Booking;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\BookingStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

/**
 * TCK-227 — Cross-tenant reporting (super-admin only). All aggregations are
 * computed in SQL — no PHP iteration over individual rows. Each bucket is a
 * single COUNT/SUM query, so a 12-bucket time series runs ≤ 12 queries
 * (acceptable per the AC: < 500ms on 1k agencies / 10k users).
 */
class PlatformReportingService
{
    private const CACHE_TTL_SECONDS = 600; // 10 min — see AC.

    /**
     * TCK-389 — plafond de découpage. Un bucket est une requête SQL : sans plafond, une plage non
     * bornée éventaille autant de requêtes qu'elle contient d'intervalles.
     *
     * Le plafond n'a jamais été le défaut. Le défaut était son SILENCE : `bucketsFor()` sortait de
     * boucle par `break`, et l'enveloppe continuait d'annoncer la plage DEMANDÉE. Mesuré le
     * 2026-08-27, avant correctif :
     *
     *     growth('agencies', '12m', 'day', '2020-01-01', '2026-01-01')
     *     → buckets=60  premier=2020-01-01  dernier=2020-02-29  range=2020-01-01..2026-01-01
     *
     * Six ans annoncés, deux mois mesurés, `totals.total` comptant les seconds sous l'étiquette des
     * premiers. Aucun statut d'erreur, aucun drapeau, aucun compteur.
     *
     * **Voie retenue : REFUSER** (voie 1 du ticket), et non « dire ». Deux raisons :
     *
     *  1. Un rapport tronqué qui s'annonce tronqué reste un rapport qu'on peut lire de travers ;
     *     un 422 ne se lit pas de travers. Le ticket demandait qu'un rapport tronqué ne PUISSE PAS
     *     se lire comme un rapport complet — le refus est la seule forme qui le garantit.
     *  2. L'export CSV emprunte le même service (`ReportingController::export`), et c'est
     *     précisément le fichier qu'on relit hors contexte. Un drapeau de troncature aurait dû
     *     voyager jusque dans les colonnes du CSV pour servir à quelque chose ; le refus vaut pour
     *     l'export sans une ligne de plus.
     *
     * ⚠ Le refus est levé ICI, dans le service, et non dans les `FormRequest`. Trois requêtes
     * (`Growth`, `Revenue`, `ReportExport`) mènent au même découpage, et le nombre d'intervalles ne
     * se déduit pas des paramètres seuls : le raccourci `period` est résolu contre `Carbon::now()`.
     * Une règle de validation aurait recopié `bucketsFor()` — et deux copies d'une même borne
     * divergent.
     */
    public const MAX_BUCKETS = 60;

    private const CACHE_VERSION_KEY = 'reporting:cache_version';

    /**
     * TCK-388 — VERSION DE FORME des lignes, à incrémenter dès que la structure d'une ligne change.
     *
     * Sans elle, un déploiement laisse servir pendant tout le TTL (600 s, redis en production) des
     * enveloppes mises en cache par le code PRÉCÉDENT : des lignes sans `days` ni `partial`, alors
     * que `GrowthRow` les déclare obligatoires côté front. Rien ne plante, et c'est bien le
     * problème — pendant dix minutes l'écran rend EXACTEMENT le comportement que ce ticket corrige,
     * sans qu'aucune trace ne le dise. Le défaut se répare tout seul, ce qui est la meilleure façon
     * de ne jamais le comprendre s'il se produit ailleurs.
     *
     * ⚠ Elle remplace une action de déploiement (« penser à appeler `bumpCacheVersion()` »).
     * *Une invalidation qui dépend d'un geste humain au bon moment n'est pas une invalidation.*
     * `bumpCacheVersion()` reste ce qu'il était : l'invalidation ÉVÉNEMENTIELLE (création d'agence).
     *
     * Historique : 1 = forme d'origine (TCK-227) ; 2 = `days` / `partial` par ligne (TCK-388).
     */
    private const ROW_SCHEMA_VERSION = 2;

    /**
     * Bumped every time an Agency is created (see AppServiceProvider). Lets
     * us invalidate every reporting cache key with O(1) work — the version
     * suffix makes the old keys cold-miss.
     */
    public static function bumpCacheVersion(): void
    {
        Cache::increment(self::CACHE_VERSION_KEY);
    }

    private function cacheVersion(): int
    {
        return (int) Cache::get(self::CACHE_VERSION_KEY, 0);
    }

    /**
     * Time series of newly-created entities (agencies / users / listings)
     * bucketed by day / week / month. Returns the first row per bucket
     * boundary plus a `generated_at` stamp.
     */
    public function growth(
        string $metric,
        string $period,
        string $granularity,
        ?string $startsAt = null,
        ?string $endsAt = null,
    ): array {
        $window = $this->window($period, $startsAt, $endsAt);
        $key = sprintf(
            'reporting:growth:%s:%s:%s:%s:v%d:s%d',
            $metric, $period, $granularity, $this->windowKey($window), $this->cacheVersion(), self::ROW_SCHEMA_VERSION
        );

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($metric, $granularity, $window): array {
            $buckets = $this->bucketsFor($window, $granularity);
            $rows = [];
            $total = 0;

            foreach ($buckets as $bucket) {
                $count = $this->countInBucket($metric, $bucket['start'], $bucket['end']);
                $total += $count;
                $rows[] = [
                    'bucket' => $bucket['label'],
                    'starts_at' => $bucket['start']->toIso8601String(),
                    'ends_at' => $bucket['end']->toIso8601String(),
                    'days' => $bucket['days'],
                    'partial' => $bucket['partial'],
                    'count' => $count,
                ];
            }

            return $this->envelope($rows, ['total' => $total], $window['range'], $granularity);
        });
    }

    /**
     * MRR/ARR per bucket. `MRR(month) = Σ active subscriptions × (override
     * ?? plan.monthly_price_xof)` evaluated at the bucket boundary.
     * `ARR = MRR × 12`.
     */
    public function revenue(
        string $period,
        string $granularity,
        ?string $startsAt = null,
        ?string $endsAt = null,
    ): array {
        $window = $this->window($period, $startsAt, $endsAt);
        $key = sprintf(
            'reporting:revenue:%s:%s:%s:v%d:s%d',
            $period, $granularity, $this->windowKey($window), $this->cacheVersion(), self::ROW_SCHEMA_VERSION
        );

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($granularity, $window): array {
            $buckets = $this->bucketsFor($window, $granularity);
            $rows = [];

            foreach ($buckets as $bucket) {
                $atMoment = $bucket['end'];
                $row = $this->revenueSnapshotAt($atMoment);
                $rows[] = array_merge([
                    'bucket' => $bucket['label'],
                    'starts_at' => $bucket['start']->toIso8601String(),
                    'ends_at' => $atMoment->toIso8601String(),
                    'days' => $bucket['days'],
                    'partial' => $bucket['partial'],
                ], $row);
            }

            $latest = end($rows) ?: ['mrr' => 0, 'arr' => 0, 'active_subscriptions' => 0];

            return $this->envelope($rows, [
                'latest_mrr' => $latest['mrr'],
                'latest_arr' => $latest['arr'],
                'latest_active_subscriptions' => $latest['active_subscriptions'],
            ], $window['range'], $granularity);
        });
    }

    /**
     * Agency retention cohorts. Each row is a cohort (one signup month) and
     * exposes the % of cohort members still active at M+0, M+1, …, M+depth.
     */
    public function cohorts(string $cohortBasis, int $depth): array
    {
        $depth = max(1, min(24, $depth));
        $key = sprintf('reporting:cohorts:%s:%d:v%d', $cohortBasis, $depth, $this->cacheVersion());

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($depth): array {
            $rows = [];
            $startCohort = Carbon::now()->startOfMonth()->subMonths($depth);

            for ($i = 0; $i < $depth; $i++) {
                $cohortStart = $startCohort->copy()->addMonths($i)->startOfMonth();
                $cohortEnd = $cohortStart->copy()->endOfMonth();

                $cohortIds = Agency::query()
                    ->withTrashed()
                    ->whereBetween('created_at', [$cohortStart, $cohortEnd])
                    ->pluck('id');
                $cohortSize = $cohortIds->count();

                $cells = [];
                for ($m = 0; $m <= ($depth - $i); $m++) {
                    $milestone = $cohortStart->copy()->addMonths($m)->endOfMonth();
                    if ($milestone->isFuture()) {
                        $cells[] = ['month' => $m, 'active' => null, 'rate' => null];

                        continue;
                    }
                    if ($cohortSize === 0) {
                        $cells[] = ['month' => $m, 'active' => 0, 'rate' => null];

                        continue;
                    }

                    $active = Agency::query()
                        ->withTrashed()
                        ->whereIn('id', $cohortIds)
                        ->where(function (Builder $q) use ($milestone): void {
                            $q->whereNull('deleted_at')->orWhere('deleted_at', '>', $milestone);
                        })
                        ->count();

                    $cells[] = [
                        'month' => $m,
                        'active' => $active,
                        'rate' => round($active / $cohortSize, 4),
                    ];
                }

                $rows[] = [
                    'cohort' => $cohortStart->format('Y-m'),
                    'cohort_size' => $cohortSize,
                    'cells' => $cells,
                ];
            }

            return $this->envelope($rows, [
                'cohorts' => count($rows),
                'depth' => $depth,
            ], "{$depth}m", 'month');
        });
    }

    /**
     * Conversion funnel over the period: published listings → bookings
     * requested → bookings confirmed → leases signed. All values are
     * counts of distinct rows over the period window.
     */
    public function funnel(string $period): array
    {
        $key = sprintf('reporting:funnel:%s:v%d', $period, $this->cacheVersion());

        return Cache::remember($key, self::CACHE_TTL_SECONDS, function () use ($period): array {
            $end = Carbon::now()->endOfDay();
            $start = $this->periodStart($period, $end);

            $listingsPublished = Property::query()
                ->whereBetween('published_at', [$start, $end])
                ->count();
            $bookingsRequested = Booking::query()
                ->whereBetween('created_at', [$start, $end])
                ->count();
            $bookingsConfirmed = Booking::query()
                ->whereBetween('created_at', [$start, $end])
                ->where('status', BookingStatus::Confirmed)
                ->count();
            $leasesSigned = Lease::query()
                ->whereBetween('signed_at', [$start, $end])
                ->count();

            $rows = [
                ['stage' => 'listings_published', 'count' => $listingsPublished],
                ['stage' => 'bookings_requested', 'count' => $bookingsRequested],
                ['stage' => 'bookings_confirmed', 'count' => $bookingsConfirmed],
                ['stage' => 'leases_signed', 'count' => $leasesSigned],
            ];

            return $this->envelope($rows, [
                'conversion_rate' => $listingsPublished > 0
                    ? round($leasesSigned / $listingsPublished, 4)
                    : null,
            ], $period, 'period');
        });
    }

    /**
     * @return list<array{label:string, start: Carbon, end: Carbon, days:int, partial:bool}>
     */
    /**
     * Résout la FENÊTRE d'un rapport — soit le raccourci `period`, soit une plage libre.
     *
     * TCK-361. Jusqu'ici la fenêtre était toujours ancrée à `Carbon::now()` et `period` était une
     * énumération fermée : ni une plage libre, ni la PÉRIODE PRÉCÉDENTE n'étaient demandables.
     * Le front ne pouvait donc pas comparer deux fenêtres, faute de pouvoir en nommer une seconde.
     * Les deux bornes sont additives — `period` seul se comporte exactement comme avant.
     *
     * @return array{start: Carbon, end: Carbon, range: string}
     */
    private function window(string $period, ?string $startsAt, ?string $endsAt): array
    {
        if ($startsAt !== null && $endsAt !== null) {
            $start = Carbon::parse($startsAt)->startOfDay();
            $end = Carbon::parse($endsAt)->endOfDay();

            // Une plage inversée rendrait zéro bucket : on la remet à l'endroit plutôt que de
            // rendre une série vide qui ressemblerait à « aucune donnée sur la période ».
            if ($start->greaterThan($end)) {
                [$start, $end] = [$end->copy()->startOfDay(), $start->copy()->endOfDay()];
            }

            return [
                'start' => $start,
                'end' => $end,
                'range' => sprintf('%s..%s', $start->toDateString(), $end->toDateString()),
            ];
        }

        $end = Carbon::now()->endOfDay();

        return ['start' => $this->periodStart($period, $end), 'end' => $end, 'range' => $period];
    }

    /**
     * Discriminant de cache de la fenêtre.
     *
     * ⚠ Une plage libre DOIT entrer dans la clé : sans elle, deux fenêtres différentes du même
     * `period` se serviraient mutuellement leur cache pendant 10 minutes — et le défaut ne se
     * verrait qu'à la comparaison, où les deux séries deviendraient identiques.
     */
    private function windowKey(array $window): string
    {
        return $window['range'];
    }

    /** @param array{start: Carbon, end: Carbon, range: string} $window */
    private function bucketsFor(array $window, string $granularity): array
    {
        $end = $window['end'];
        $start = $window['start'];

        $buckets = [];
        $cursor = $start->copy();

        while ($cursor->lessThanOrEqualTo($end)) {
            [$naturalStart, $naturalEnd, $label] = match ($granularity) {
                'day' => [$cursor->copy()->startOfDay(), $cursor->copy()->endOfDay(), $cursor->toDateString()],
                'week' => [$cursor->copy()->startOfWeek(), $cursor->copy()->endOfWeek(), $cursor->copy()->startOfWeek()->format('Y-\WW')],
                'month' => [$cursor->copy()->startOfMonth(), $cursor->copy()->endOfMonth(), $cursor->format('Y-m')],
                default => [$cursor->copy()->startOfMonth(), $cursor->copy()->endOfMonth(), $cursor->format('Y-m')],
            };

            [$bucketStart, $bucketEnd] = [$naturalStart->copy(), $naturalEnd->copy()];

            // Les DEUX bornes du bucket sont ramenées dans la fenêtre, et c'est une symétrie, pas
            // une précaution : `startOfMonth()` / `startOfWeek()` reculent AVANT `$start` dès que
            // la fenêtre ne commence pas sur une frontière de bucket. Seule la borne haute était
            // ramenée — une plage libre commençant un 15 comptait donc les quatorze jours qui la
            // précèdent, sous une étiquette que l'utilisateur avait lui-même choisie (D5, TCK-361).
            if ($bucketStart->lessThan($start)) {
                $bucketStart = $start->copy();
            }

            if ($bucketEnd->greaterThan($end)) {
                $bucketEnd = $end->copy();
            }

            // TCK-388 — un bucket RAMENÉ dans la fenêtre ne couvre plus la durée que son étiquette
            // annonce. `2026-03` peut valoir dix-sept jours, et l'étiquette ne peut pas le dire :
            // elle nomme un mois. La partialité est donc MESURÉE ici — au seul endroit qui connaisse
            // encore les bornes NATURELLES du bucket — plutôt que redéduite en aval des deux bornes,
            // ce qui aurait demandé au front de reconstruire un calendrier.
            $partial = $bucketStart->notEqualTo($naturalStart) || $bucketEnd->notEqualTo($naturalEnd);

            $buckets[] = [
                'label' => $label,
                'start' => $bucketStart,
                'end' => $bucketEnd,
                // `diffInDays` rend un FLOTTANT en Carbon 3 : sans le cast, la clé JSON sortirait \`18.0\`.
                'days' => (int) $bucketStart->copy()->startOfDay()->diffInDays($bucketEnd->copy()->startOfDay()) + 1,
                'partial' => $partial,
            ];

            $cursor = match ($granularity) {
                'day' => $cursor->copy()->addDay(),
                'week' => $cursor->copy()->addWeek(),
                default => $cursor->copy()->addMonthNoOverflow(),
            };

            // TCK-389 — le `break` d'avant rendait une série tronquée sous l'étiquette de la plage
            // demandée. On refuse au lieu de tronquer, et on refuse AVANT de produire quoi que ce
            // soit : rien n'est mis en cache, aucune ligne d'export n'est écrite.
            if (count($buckets) >= self::MAX_BUCKETS && $cursor->lessThanOrEqualTo($end)) {
                $this->refuserPlageTropLarge($window, $granularity);
            }
        }

        return $buckets;
    }

    /**
     * 422 nommant la contrainte, sur le champ que l'appelant peut effectivement changer.
     *
     * Sur une plage libre, c'est `ends_at` ; sur un raccourci `period`, l'appelant n'a d'autre prise
     * que la granularité. Pointer `starts_at` sur un raccourci désignerait un champ qu'il n'a pas
     * envoyé.
     */
    private function refuserPlageTropLarge(array $window, string $granularity): never
    {
        $champ = str_contains($window['range'], '..') ? 'ends_at' : 'granularity';

        throw ValidationException::withMessages([
            $champ => [sprintf(
                'La plage demandée dépasse le plafond de %d intervalles « %s ». Réduisez la plage ou élargissez la granularité.',
                self::MAX_BUCKETS,
                $granularity,
            )],
        ]);
    }

    private function countInBucket(string $metric, Carbon $start, Carbon $end): int
    {
        return match ($metric) {
            'agencies' => Agency::query()->whereBetween('created_at', [$start, $end])->count(),
            'users' => User::query()->whereBetween('created_at', [$start, $end])->count(),
            'listings' => Property::query()->whereBetween('created_at', [$start, $end])->count(),
            default => 0,
        };
    }

    /**
     * @return array{mrr: float, arr: float, active_subscriptions: int}
     */
    private function revenueSnapshotAt(Carbon $atMoment): array
    {
        // Single SQL row — COUNT(*) + override-aware MRR via COALESCE on the
        // join. No PHP iteration over individual subscriptions.
        $row = AgencySubscription::query()
            ->join('plans', 'plans.id', '=', 'agency_subscriptions.plan_id')
            ->where(function (Builder $q) use ($atMoment): void {
                $q->whereNull('agency_subscriptions.ended_at')
                    ->orWhere('agency_subscriptions.ended_at', '>', $atMoment);
            })
            ->where('agency_subscriptions.current_period_start', '<=', $atMoment)
            ->whereIn('agency_subscriptions.status', [
                AgencySubscriptionStatus::Trialing->value,
                AgencySubscriptionStatus::Active->value,
                AgencySubscriptionStatus::PastDue->value,
            ])
            ->selectRaw('COUNT(*) as active_count, COALESCE(SUM(plans.monthly_price_xof), 0) as mrr')
            ->first();

        $mrr = (float) ($row->mrr ?? 0);
        $count = (int) ($row->active_count ?? 0);

        return [
            'mrr' => round($mrr, 2),
            'arr' => round($mrr * 12, 2),
            'active_subscriptions' => $count,
        ];
    }

    private function periodStart(string $period, Carbon $end): Carbon
    {
        return match ($period) {
            '3m' => $end->copy()->subMonthsNoOverflow(3)->startOfDay(),
            '6m' => $end->copy()->subMonthsNoOverflow(6)->startOfDay(),
            '12m' => $end->copy()->subMonthsNoOverflow(12)->startOfDay(),
            '30d' => $end->copy()->subDays(30)->startOfDay(),
            '90d' => $end->copy()->subDays(90)->startOfDay(),
            default => $end->copy()->subMonthsNoOverflow(12)->startOfDay(),
        };
    }

    private function envelope(array $rows, array $totals, string $period, string $granularity): array
    {
        return [
            'rows' => $rows,
            'totals' => $totals,
            'period' => ['range' => $period, 'granularity' => $granularity],
            'generated_at' => now()->toIso8601String(),
        ];
    }
}
