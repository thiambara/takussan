<?php

namespace App\Mail\Transport;

use GuzzleHttp\Client as GuzzleClient;
use Resend\Client;
use Resend\Transporters\HttpTransporter;
use Resend\ValueObjects\ApiKey;
use Resend\ValueObjects\Transporter\BaseUri;
use Resend\ValueObjects\Transporter\Headers;

/**
 * Le client Resend du transport `resend`, sur un Guzzle borné (P65.04, TCK-1074).
 *
 * `Resend::client()` (resend-php) construit `new GuzzleClient()` sans option : aucun délai total, et
 * la connexion attend celui de cURL. Or l'invitation part dans la requête HTTP, et sa relance dans la
 * transaction, sous le verrou de l'invitation (TCK-367, voulu : un envoi en échec ne laisse pas
 * d'invitation `sent` sans lien reçu). Un Resend muet tenait donc la requête et le verrou jusqu'à la
 * borne de PHP. Ce client reprend `Resend::client()` à l'identique, base `RESEND_BASE_URL` comprise,
 * et ne change que les options de Guzzle.
 */
final class BoundedResendClient
{
    public const CONNECT_TIMEOUT_SECONDS = 5;

    public const TIMEOUT_SECONDS = 10;

    public static function make(string $apiKey): Client
    {
        $guzzle = new GuzzleClient([
            'connect_timeout' => self::CONNECT_TIMEOUT_SECONDS,
            'timeout' => self::TIMEOUT_SECONDS,
        ]);

        return new Client(new HttpTransporter(
            $guzzle,
            BaseUri::from(getenv('RESEND_BASE_URL') ?: 'api.resend.com'),
            Headers::withAuthorization(ApiKey::from($apiKey)),
        ));
    }
}
