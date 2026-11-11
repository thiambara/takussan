<?php

namespace App\Http\Controllers\Api\Credits;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Credits\CreditSuggestionsRequest;
use App\Http\Requests\Credits\IndexCreditBoostsRequest;
use App\Http\Resources\Credits\CreditBoostResource;
use App\Http\Resources\Credits\CreditSuggestionResource;
use App\Models\Enums\BoostStatus;
use App\Models\PropertyBoost;
use App\Services\Credits\BoostMeasures;
use App\Services\Credits\BoostSuggestions;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2663 — les mises en avant de l'espace ACTIF et ce qu'elles ont rapporté, et les biens à
 * pousser. Même autorisation que `GET /api/credits` (`boost.spend` sur l'espace). Forme fixe (pas de
 * `fields[...]`) : la page Crédits lit tout.
 */
class CreditBoostController extends Controller
{
    use ReadsWallet;

    /** Ce qui s'est terminé depuis moins de ce nombre de jours reste dans la liste par défaut. */
    public const RECENT_DAYS = 30;

    public function index(IndexCreditBoostsRequest $request, BoostMeasures $measures): JsonResponse
    {
        $agency = $this->walletAgency($request);
        $live = array_map(static fn (BoostStatus $s): string => $s->value, BoostStatus::live());

        $query = PropertyBoost::query()->where('agency_id', $agency->getKey());
        match ($request->input('filter.status')) {
            'active' => $query->whereIn('status', $live),
            'ended' => $query->whereNotIn('status', $live),
            default => $query->where(fn ($q) => $q->whereIn('status', $live)
                ->orWhere('ended_at', '>=', now()->subDays(self::RECENT_DAYS))),
        };
        if ($request->filled('filter.id')) {
            $query->whereKey($request->integer('filter.id'));
        }

        $boosts = $query
            ->with(['property.media', 'property.address', 'property.agency'])
            // Ce qui court d'abord (`ended_at` nul), le plus récent en tête ; puis le plus récemment terminé.
            ->orderByRaw('ended_at DESC NULLS FIRST')
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->paginate($this->tailleDePage($request, 20, 50));

        $measures->attachTo($boosts->getCollection());

        return $this->paginated($boosts, CreditBoostResource::collection($boosts->getCollection())->resolve($request));
    }

    public function suggestions(CreditSuggestionsRequest $request, BoostSuggestions $suggestions): JsonResponse
    {
        $agency = $this->walletAgency($request);
        $result = $suggestions->for($agency, $request->integer('limit', CreditSuggestionsRequest::LIMIT_MAX));

        return $this->json([
            'data' => CreditSuggestionResource::collection($result['items'])->resolve($request),
            'meta' => ['total' => $result['total']],
        ]);
    }
}
