<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Services\Auth\OAuthProviderConfiguration;
use Illuminate\Http\JsonResponse;

class OAuthProviderController extends Controller
{
    public function __invoke(OAuthProviderConfiguration $configuration): JsonResponse
    {
        return $this->json(['data' => ['providers' => $configuration->all()]]);
    }
}
