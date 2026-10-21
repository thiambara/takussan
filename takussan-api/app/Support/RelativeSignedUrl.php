<?php

namespace App\Support;

use DateInterval;
use DateTimeInterface;
use Illuminate\Support\Facades\URL;

/**
 * TCK-1059 (P73.02) — un lien signé qui reste sur le domaine de l'API, signé en RELATIF.
 *
 * Une signature absolue porte le schéma et l'hôte : la vérifier compare à ce que l'API voit de la
 * requête. Derrière Traefik, qui termine TLS, l'API ne voit `https` que si l'adresse de Traefik
 * est dans `TRUSTED_PROXIES` : un oubli rendait 403 sur tout fichier privé, tout désabonnement et
 * tout accusé LAfricaMobile. Signée sur le seul chemin et sa requête, l'URL reste valide quelle que
 * soit la liste. L'hôte ne change pas : il est fixé à l'émission par `APP_URL` (TCK-1058).
 *
 * ⚠ La vérification doit être relative aussi : `signed:relative` sur la route, ou
 * `hasValidSignature(false)` dans le contrôleur. Une URL émise ici échoue à une vérification
 * absolue, et l'inverse aussi.
 */
final class RelativeSignedUrl
{
    /** @param  array<string, mixed>  $parameters */
    public static function temporary(string $route, DateTimeInterface|DateInterval|int $expiration, array $parameters = []): string
    {
        return URL::to(URL::temporarySignedRoute($route, $expiration, $parameters, absolute: false));
    }

    /** @param  array<string, mixed>  $parameters */
    public static function forever(string $route, array $parameters = []): string
    {
        return URL::to(URL::signedRoute($route, $parameters, absolute: false));
    }
}
