<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\AiErrorCode;
use App\Services\Ai\Exceptions\AiUnavailable;
use GuzzleHttp\Psr7\Response;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response as ClientResponse;
use JsonException;
use Laravel\Ai\Exceptions\AiException;
use Laravel\Ai\Exceptions\InsufficientCreditsException;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;
use Throwable;

/**
 * TCK-2399 — une erreur d'appel au modèle se lit par un code `ai.*` stable, que le front traduit ;
 * jamais par le nom d'une classe du SDK, qui change d'une version à l'autre.
 */
class AiErrorCodeTest extends TestCase
{
    /** @return array<string, array{0: Throwable, 1: string}> */
    public static function erreurs(): array
    {
        $http = fn (int $statut) => new RequestException(new ClientResponse(new Response($statut)));

        return [
            'débit limité' => [RateLimitedException::forProvider('anthropic'), 'ai.provider_rate_limited'],
            'surcharge' => [new ProviderOverloadedException('x'), 'ai.provider_unavailable'],
            'connexion du SDK' => [new ProviderConnectionException('x'), 'ai.provider_unavailable'],
            'crédits épuisés' => [new InsufficientCreditsException('x'), 'ai.provider_credits'],
            'délai dépassé, emballé par le SDK' => [ProviderConnectionException::forProvider('anthropic', 0, new ConnectionException('cURL error 28: Operation timed out')), 'ai.provider_timeout'],
            'délai dépassé' => [new ConnectionException('cURL error 28: Operation timed out after 300000 milliseconds'), 'ai.provider_timeout'],
            'hôte injoignable' => [new ConnectionException('cURL error 6: Could not resolve host'), 'ai.provider_unavailable'],
            'clé refusée 401' => [$http(401), 'ai.provider_auth'],
            'délai du fournisseur 408' => [$http(408), 'ai.provider_timeout'],
            'clé refusée dans le corps' => [new AiException('OpenRouter Error: [401] Clé refusée.'), 'ai.provider_auth'],
            'panne dans le corps' => [new AiException('OpenRouter Error: [502] 401 en amont [auth].'), 'ai.unexpected'],
            'clé refusée 403' => [$http(403), 'ai.provider_auth'],
            'débit 429' => [$http(429), 'ai.provider_rate_limited'],
            'panne 503' => [$http(503), 'ai.provider_unavailable'],
            'requête refusée 400' => [$http(400), 'ai.request_rejected'],
            'réponse illisible' => [new JsonException('Syntax error'), 'ai.response_invalid'],
            'code du socle' => [new AiUnavailable('ai.response_truncated'), 'ai.response_truncated'],
            'inconnue' => [new RuntimeException('message du fournisseur avec la requête'), 'ai.unexpected'],
        ];
    }

    #[DataProvider('erreurs')]
    public function test_chaque_erreur_connue_a_son_code(Throwable $erreur, string $code): void
    {
        $this->assertSame($code, AiErrorCode::fromThrowable($erreur));
    }

    public function test_un_code_rendu_ne_porte_jamais_le_message(): void
    {
        $this->assertStringNotContainsString('requête', AiErrorCode::fromThrowable(new RuntimeException('requête secrète')));
    }
}
