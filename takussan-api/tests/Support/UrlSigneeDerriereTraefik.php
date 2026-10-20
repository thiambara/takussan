<?php

namespace Tests\Support;

use Illuminate\Support\Facades\URL;
use Illuminate\Testing\TestResponse;

/**
 * TCK-1059 (P73.02) — une URL signée émise comme en production, puis présentée comme l'API la voit
 * quand l'adresse de Traefik manque à `TRUSTED_PROXIES`.
 *
 *   · l'émission part d'`APP_URL` en `https` (racine forcée, TCK-1058), comme une tâche de file ;
 *   · Traefik termine TLS et parle `http` à l'API ; d'une adresse hors de la liste, son
 *     `X-Forwarded-Proto: https` n'est pas cru, et l'API voit donc `http://…`.
 *
 * Une signature ABSOLUE porte le schéma, et refuse alors le lien (403). Une signature RELATIVE ne
 * porte que le chemin et la requête : le lien reste valide, quelle que soit la liste.
 */
trait UrlSigneeDerriereTraefik
{
    protected const ORIGINE_PUBLIQUE = 'https://api-publique.example';

    protected function signerCommeEnProduction(): void
    {
        config(['app.url' => self::ORIGINE_PUBLIQUE]);
        URL::forceRootUrl(self::ORIGINE_PUBLIQUE);
        URL::forceScheme('https');
    }

    protected function presenterHorsDesMandataires(string $url): TestResponse
    {
        $this->assertStringStartsWith(self::ORIGINE_PUBLIQUE.'/', $url, "l'émission porte l'origine d'APP_URL");

        return $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.7'])
            ->withHeaders(['X-Forwarded-Proto' => 'https'])
            ->get('http://api-publique.example'.substr($url, strlen(self::ORIGINE_PUBLIQUE)));
    }
}
