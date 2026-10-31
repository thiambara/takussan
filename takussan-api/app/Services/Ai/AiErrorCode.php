<?php

namespace App\Services\Ai;

use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use JsonException;
use Laravel\Ai\Exceptions\AiException;
use Laravel\Ai\Exceptions\InsufficientCreditsException;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;
use Throwable;

/**
 * TCK-2399 — le code `ai.*` d'une erreur d'appel au modèle, pour `ai_calls.error_code`,
 * `ai_evaluation_runs.error_code` et le test de connexion. Le front le traduit ; le nom de la classe
 * reste au journal Laravel. Table fermée, relue sur `laravel/ai` 1.3
 * (`Gateway\Concerns\HandlesFailoverErrors`) : une `ConnectionException` y arrive emballée dans
 * `ProviderConnectionException`, un 401 ou un 400 en `RequestException` brute.
 */
final class AiErrorCode
{
    public static function fromThrowable(Throwable $e): string
    {
        return match (true) {
            $e instanceof AiUnavailable, $e instanceof AiRefused => $e->getMessage(),
            $e instanceof RateLimitedException => 'ai.provider_rate_limited',
            $e instanceof InsufficientCreditsException => 'ai.provider_credits',
            $e instanceof ProviderOverloadedException => 'ai.provider_unavailable',
            $e instanceof ProviderConnectionException => $e->getPrevious() instanceof ConnectionException
                ? self::connection($e->getPrevious()) : 'ai.provider_unavailable',
            $e instanceof ConnectionException => self::connection($e),
            $e instanceof RequestException => self::status($e->response->status()),
            $e instanceof JsonException => 'ai.response_invalid',
            $e::class === AiException::class && self::bodyRefusesTheKey($e) => 'ai.provider_auth',
            default => 'ai.unexpected',
        };
    }

    /**
     * TCK-2449 — une erreur écrite dans le corps d'une réponse HTTP 200 : le SDK n'en garde que « [type ou code]
     * message ». Un 401 ou un 403 y vaut le même statut HTTP. Le message est lu, jamais rendu.
     */
    private static function bodyRefusesTheKey(AiException $e): bool
    {
        return preg_match('/^[^\[]*\[(?:401|403|[^\]]*(?:auth|permission|forbidden|api_key)[^\]]*)\]/i', $e->getMessage()) === 1;
    }

    private static function connection(ConnectionException $e): string
    {
        // cURL 28 : « Operation timed out ». Le message est lu, jamais rendu.
        return str_contains(strtolower($e->getMessage()), 'timed out') ? 'ai.provider_timeout' : 'ai.provider_unavailable';
    }

    private static function status(int $status): string
    {
        return match (true) {
            $status === 401, $status === 403 => 'ai.provider_auth',
            $status === 408 => 'ai.provider_timeout',
            $status === 429 => 'ai.provider_rate_limited',
            $status >= 500 => 'ai.provider_unavailable',
            default => 'ai.request_rejected',
        };
    }
}
