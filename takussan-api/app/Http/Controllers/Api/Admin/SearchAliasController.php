<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Admin\ListSearchAliasesRequest;
use App\Http\Requests\Api\Admin\UpdateSearchAliasRequest;
use App\Http\Resources\Api\Admin\SearchAliasResource;
use App\Models\Enums\SearchAliasOrigin;
use App\Models\SearchAlias;
use Illuminate\Http\JsonResponse;

/**
 * TCK-2476 (ADR-0088 §7) — les variantes d'écriture de la recherche : les lire, et les trancher. Un geste d'opérateur rend
 * la variante `manual` : l'usage `search.variantes` ne la modifie plus, et une variante rejetée ne revient jamais.
 * `super_admin` seul (`routes/api/admin-search.php`, `platform.settings.manage`).
 */
class SearchAliasController extends Controller
{
    public function index(ListSearchAliasesRequest $request): JsonResponse
    {
        $paginator = SearchAlias::buildQuery(null, $request)
            ->defaultSort('-updated_at')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 25))))
            ->withQueryString();

        return $this->paginated($paginator, SearchAliasResource::collection($paginator)->toArray($request));
    }

    public function update(UpdateSearchAliasRequest $request, SearchAlias $alias): JsonResponse
    {
        $before = $alias->status->value;
        $alias->forceFill(['status' => $request->string('status')->toString(), 'origin' => SearchAliasOrigin::Manual])->save();
        SearchAlias::forgetCaches();

        activity('Admin')
            ->causedBy($request->user())
            ->performedOn($alias)
            ->withProperties(['before' => $before, 'after' => $alias->status->value])
            ->event('search_alias_updated')
            ->log('Variante d\'écriture tranchée');

        return $this->json(['data' => new SearchAliasResource($alias->fresh())]);
    }
}
