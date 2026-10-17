<?php

namespace App\Support\Logging;

use Illuminate\Http\Client\Response;

/**
 * TCK-773 (P14.10) — ce qu'un journal garde de la réponse en échec d'un fournisseur : le statut
 * HTTP et le code d'erreur du fournisseur, jamais le corps. Le corps d'un refus Wave ou Orange
 * Money peut recopier le numéro du payeur ou un message libre (ADR-0044 § 2, même règle que
 * `SafeExceptionContext` pour une exception).
 */
final class ProviderResponseContext
{
    /** Les clés où les fournisseurs rangent leur code d'erreur, par ordre de préférence. */
    private const CODE_KEYS = ['code', 'error_code', 'error'];

    private const MAX_CODE_LENGTH = 64;

    /** @return array{status: int, provider_code: string|null} */
    public static function of(Response $response): array
    {
        return ['status' => $response->status(), 'provider_code' => self::code($response)];
    }

    private static function code(Response $response): ?string
    {
        $json = $response->json();
        if (! is_array($json)) {
            return null;
        }

        foreach (self::CODE_KEYS as $key) {
            $value = $json[$key] ?? null;
            if (is_string($value) || is_int($value)) {
                return mb_substr((string) $value, 0, self::MAX_CODE_LENGTH);
            }
        }

        return null;
    }
}
