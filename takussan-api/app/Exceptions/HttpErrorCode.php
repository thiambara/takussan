<?php

namespace App\Exceptions;

/**
 * TCK-588 (ADR-0032) — le code d'une `HttpException` qui n'est pas une `ApiError` : `http.<statut>`,
 * nommé, avec sa clé dans `lang/{fr,en,wo}/errors.php`. Un statut absent de la table retombe sur
 * `http.client_error` (4xx) ou `http.server_error` (5xx) : jamais de clé brute.
 */
final class HttpErrorCode
{
    public const NAMES = [
        400 => 'bad_request',
        401 => 'unauthorized',
        402 => 'payment_required',
        403 => 'forbidden',
        404 => 'not_found',
        405 => 'method_not_allowed',
        406 => 'not_acceptable',
        408 => 'request_timeout',
        409 => 'conflict',
        410 => 'gone',
        413 => 'payload_too_large',
        415 => 'unsupported_media_type',
        419 => 'page_expired',
        422 => 'unprocessable',
        423 => 'locked',
        429 => 'too_many_requests',
        500 => 'server_error',
        502 => 'bad_gateway',
        503 => 'service_unavailable',
        504 => 'gateway_timeout',
    ];

    public static function for(int $status): string
    {
        return 'http.'.(self::NAMES[$status] ?? ($status >= 500 ? 'server_error' : 'client_error'));
    }
}
