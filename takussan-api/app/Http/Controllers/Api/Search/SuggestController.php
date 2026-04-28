<?php

namespace App\Http\Controllers\Api\Search;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Search\SuggestRequest;
use App\Services\Search\SuggestService;
use Illuminate\Http\JsonResponse;

class SuggestController extends Controller
{
    public function __construct(
        private readonly SuggestService $service,
    ) {}

    public function __invoke(SuggestRequest $request): JsonResponse
    {
        $locale = app()->getLocale();
        $payload = $this->service->resolve($request->q(), $request->limit(), $locale);

        return response()
            ->json(['data' => $payload])
            ->header('Cache-Control', 'public, max-age=60');
    }
}
