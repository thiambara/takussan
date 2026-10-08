<?php

/*
 * TCK-588 (ADR-0032) — les trois formes d'une erreur métier codée.
 *
 * `abort_code(403, 'auth.super_admin_required')` rend
 * `HTTP 403 {code: "payout.landlord_not_in_agency", message: <errors.payout.landlord_not_in_agency>}`.
 * Le code est un LITTÉRAL (la garde de parité le cherche dans `lang/{fr,en,wo}/errors.php`).
 */

use App\Exceptions\ApiError;

if (! function_exists('abort_code')) {
    /**
     * @param  array<string, scalar|list<scalar>|null>  $params
     * @param  array<string, string>  $headers
     */
    function abort_code(int $status, string $code, array $params = [], array $headers = []): never
    {
        throw new ApiError($status, $code, $params, $headers);
    }
}

if (! function_exists('abort_code_if')) {
    /**
     * @param  array<string, scalar|list<scalar>|null>  $params
     */
    function abort_code_if(mixed $condition, int $status, string $code, array $params = []): void
    {
        if ($condition) {
            abort_code($status, $code, $params);
        }
    }
}

if (! function_exists('abort_code_unless')) {
    /**
     * @param  array<string, scalar|list<scalar>|null>  $params
     */
    function abort_code_unless(mixed $condition, int $status, string $code, array $params = []): void
    {
        if (! $condition) {
            abort_code($status, $code, $params);
        }
    }
}
