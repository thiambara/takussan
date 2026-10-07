<?php

namespace App\Services\Auth;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;

/**
 * TCK-589 — un refus d'authentification porte un CODE stable que le front lit
 * (ADR-0019), à côté d'un message traduit. Les codes de ce ticket :
 * `phone_taken`, `account_blocked`, `account_locked`, `two_factor_required`,
 * `two_factor_step_up_required`, `two_factor_mandatory`.
 *
 * Le gestionnaire d'exceptions de `bootstrap/app.php` ne rend que `message` pour
 * un `abort()` : un code s'y perdrait. D'où une réponse construite ici, levée par
 * {@see self::abort()} depuis un service. TCK-588 généralise le mécanisme
 * (`abort_code()`) ; ces appels s'y convertiront.
 */
final class AuthRefusal
{
    /**
     * @param  array<string, mixed>  $extra
     */
    public static function response(int $status, string $code, string $messageKey, array $extra = []): JsonResponse
    {
        return new JsonResponse(['message' => __($messageKey), 'code' => $code] + $extra, $status);
    }

    public static function abort(int $status, string $code, string $messageKey): never
    {
        throw new HttpResponseException(self::response($status, $code, $messageKey));
    }
}
