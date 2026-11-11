<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Services\Lease\LeaseAttention;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-2642 — `GET /api/leases/summary` : les comptes des onglets et des motifs de la liste des baux
 * en UN appel. Même portée que `GET /api/leases` (`Lease::scopeVisibleTo`), puis les filtres de la
 * requête par `Lease::buildQuery()` (`filter[search]`, …). Chaque compte égale le `meta.total` de la
 * liste sous le filtre correspondant (AC4) :
 *
 * | clé | filtre de la liste |
 * |---|---|
 * | `a_traiter` | `filter[a_traiter]=1` |
 * | `active` | `filter[status]=active,terminating` |
 * | `onboarding_pending` | `filter[onboarding_pending]=1` |
 * | `ended` | `filter[status]=expired,terminated,renewed` |
 * | `draft` | `filter[status]=draft,pending_signature` |
 * | `motifs.<motif>` | `filter[motif]=<motif>` |
 */
class LeaseSummaryController extends Controller
{
    /** @var array<string, list<LeaseStatus>> */
    public const STATUS_TABS = [
        'active' => [LeaseStatus::Active, LeaseStatus::Terminating],
        'ended' => [LeaseStatus::Expired, LeaseStatus::Terminated, LeaseStatus::Renewed],
        'draft' => [LeaseStatus::Draft, LeaseStatus::PendingSignature],
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $attention = LeaseAttention::for($user);
        $scope = Lease::buildQuery(Lease::query()->visibleTo($user), $request)->getEloquentBuilder();
        $count = fn (callable $narrow): int => $narrow((clone $scope)->reorder())->count();

        $byStatus = fn (string $tab): int => $count(fn (Builder $q) => $q->whereIn('leases.status', array_map(fn (LeaseStatus $s) => $s->value, self::STATUS_TABS[$tab])));
        // L'ordre des onglets de la page (ticket) : à traiter, en cours, entrées en attente, terminés, brouillons.
        $tabs = [
            'a_traiter' => $count(fn (Builder $q) => $attention->whereAny($q)),
            'active' => $byStatus('active'),
            'onboarding_pending' => $count(fn (Builder $q) => $attention->whereMotif($q, 'onboarding_incomplete')),
            'ended' => $byStatus('ended'),
            'draft' => $byStatus('draft'),
        ];

        $motifs = [];
        foreach (LeaseAttention::MOTIFS as $motif) {
            $motifs[$motif] = $count(fn (Builder $q) => $attention->whereMotif($q, $motif));
        }

        return $this->json(['data' => [...$tabs, 'motifs' => $motifs]]);
    }
}
