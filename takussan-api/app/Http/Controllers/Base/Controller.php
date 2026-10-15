<?php

namespace App\Http\Controllers\Base;

use App\Http\Responses\PaginationMeta;
use App\Models\Bases\AbstractModel;
use App\Models\Concerns\HasQueryBuilder;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;

abstract class Controller extends BaseController
{
    /**
     * TCK-306 — `$this->authorize(...)` pour que l'autorisation se juge dans une policy.
     *
     * Elle n'y était pas : 25 contrôleurs définissaient chacun leur `authorizeAccess()` /
     * `authorizeManage()` (88 appels) avec la même logique copiée-collée, pendant que
     * `App\Http\Controllers\Controller` — l'autre classe de base, presque inutilisée —
     * portait déjà ce trait. Les quatre contrôleurs de comptabilité l'employaient, les
     * 161 autres ne le pouvaient pas.
     *
     * `authorize()` lève `AuthorizationException` → 403, exactement comme les
     * `abort_unless($ok, 403)` qu'elle remplace.
     */
    use AuthorizesRequests;

    protected function json(mixed $data, int $status = 200, array $headers = []): JsonResponse
    {
        return response()->json($data, $status, $headers);
    }

    /**
     * Réponse paginée canonique : `{ data, meta }` (TCK-304).
     *
     * La forme des clés de `meta` est décidée une seule fois, dans
     * {@see PaginationMeta} — pas ici, et surtout pas dans le contrôleur
     * appelant.
     *
     * @param  array<string, mixed>  $extraMeta  compteurs métier propres à l'endpoint
     */
    protected function paginated(
        LengthAwarePaginator $paginator,
        mixed $data,
        array $extraMeta = [],
        int $status = 200,
    ): JsonResponse {
        return $this->json([
            'data' => $data,
            'meta' => PaginationMeta::from($paginator, $extraMeta),
        ], $status);
    }

    /**
     * Les quatre clés canoniques seules, pour les réponses qui portent d'autres racines que `data`.
     *
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    protected function paginationMeta(LengthAwarePaginator $paginator, array $extra = []): array
    {
        return PaginationMeta::from($paginator, $extra);
    }

    /**
     * La taille de page demandée par `per_page`, bornée à `[1, $max]` ; `$defaut` si elle est
     * absente, non numérique ou < 1 — la même règle que {@see HasQueryBuilder::getPerPage()}.
     *
     * TCK-654 (piste P02.02) : 26 lectures passaient `per_page` tel quel à `paginate()`, que
     * `HasQueryBuilder::PER_PAGE_MAX` ne borne pas quand la taille est explicite. Une lecture
     * non bornée est refusée par `Tests\Unit\Architecture\PerPageBorneTest`.
     */
    protected function tailleDePage(Request $request, int $defaut = 20, int $max = AbstractModel::PER_PAGE_MAX): int
    {
        $demande = $request->input('per_page');

        if (is_numeric($demande) && (int) $demande >= 1) {
            return min((int) $demande, $max);
        }

        return $defaut;
    }
}
