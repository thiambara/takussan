<?php

namespace App\Http\Controllers\Api\Search;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Search\SuggestRequest;
use App\Services\Search\Suggestions\SearchSuggestions;
use App\Services\Search\SuggestService;
use Illuminate\Http\JsonResponse;

class SuggestController extends Controller
{
    public function __construct(
        private readonly SuggestService $service,
        private readonly SearchSuggestions $suggestions,
    ) {}

    public function __invoke(SuggestRequest $request): JsonResponse
    {
        $locale = app()->getLocale();

        // TCK-2474 — les clés neuves (`interpretation`, `completions`, `popular`, `places`, `previews`) d'abord, puis
        // celles que lit le front actuel (`cities`, `neighborhoods`, `property_types`), inchangées : elles se retirent
        // avec lui (TCK-2475).
        $payload = [
            ...$this->suggestions->resolve($request->q(), $request->limit(), $locale),
            ...$this->service->resolve($request->q(), $request->limit(), $locale),
        ];

        return response()
            ->json(['data' => $payload])
            ->header('Cache-Control', 'public, max-age=60')
            // TCK-707 — le libellé de `property_types` est traduit dans la langue de la
            // requête, et l'URL ne la porte pas : sans ce `Vary`, un cache HTTP rend le
            // corps d'une autre langue. `Origin` n'est pas répété : le CORS l'ajoute au
            // `Vary` existant (même forme que `discovery`, TCK-341).
            ->header('Vary', 'Accept-Language');
    }
}
