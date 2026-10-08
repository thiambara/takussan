<?php

namespace App\Services\Auth;

use Illuminate\Http\JsonResponse;

/**
 * TCK-589 — un refus d'authentification porte un CODE stable que le front lit
 * (ADR-0019), à côté d'un message traduit. Les codes de ce ticket :
 * `phone_taken`, `account_blocked`, `account_locked`, `two_factor_required`,
 * `two_factor_step_up_required`, `two_factor_mandatory`.
 *
 * Une réponse RENDUE, jamais levée : depuis TCK-588 (ADR-0032), un refus levé depuis un
 * service passe par `abort_code()` (`phone.taken`, `auth.account_blocked`). Les codes plats
 * ci-dessus restent le contrat que le front lit (`double-facteur.ts`,
 * `ConnexionParTelephone`) ; leur conversion à la forme `<domaine>.<code>` est à faire d'un
 * bloc, front compris.
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
}
