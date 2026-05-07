<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Services\Features\FeatureFlagEvaluator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FeatureFlagMeController extends Controller
{
    public function __construct(private readonly FeatureFlagEvaluator $evaluator) {}

    public function __invoke(Request $request): JsonResponse
    {
        return $this->json(
            ['data' => $this->evaluator->forUser($request->user())],
            headers: ['Cache-Control' => 'max-age=60, private'],
        );
    }
}
