<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Auth\OAuthTwoFactorRequest;
use App\Services\Auth\OAuthSessionOpener;
use Illuminate\Http\JsonResponse;

/**
 * TCK-589, vérification adverse B2 — solde le défi qu'un rappel OAuth rend à un compte à
 * 2FA ({@see OAuthSessionOpener}) : le jeton de session n'est émis qu'ici.
 */
class OAuthTwoFactorController extends Controller
{
    public function __invoke(OAuthTwoFactorRequest $request, OAuthSessionOpener $opener): JsonResponse
    {
        return $opener->complete(
            (string) $request->validated('challenge'),
            $request->only(['two_factor_code', 'recovery_code']),
            $request,
        );
    }
}
