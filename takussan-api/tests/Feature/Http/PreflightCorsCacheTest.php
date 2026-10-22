<?php

namespace Tests\Feature\Http;

use Tests\TestCase;

/**
 * TCK-1209 (P103.01) — le navigateur garde le préflight CORS de l'API au lieu de le rejouer avant
 * chaque appel non simple (tout appel connecté porte `Authorization`). Avant : `max_age => 0`,
 * soit `Access-Control-Max-Age: 0`, et deux allers-retours par lecture.
 */
class PreflightCorsCacheTest extends TestCase
{
    public function test_le_preflight_d_une_route_publique_se_garde_cote_navigateur(): void
    {
        $origine = (string) config('cors.allowed_origins')[0];

        $reponse = $this->call('OPTIONS', '/api/public/geo/cities', server: [
            'HTTP_ORIGIN' => $origine,
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'accept-language,authorization,content-type',
        ]);

        $reponse->assertNoContent();
        $reponse->assertHeader('Access-Control-Allow-Origin', $origine);
        $maxAge = $reponse->headers->get('Access-Control-Max-Age');
        $this->assertNotNull($maxAge, 'le préflight doit porter Access-Control-Max-Age');
        $this->assertGreaterThan(0, (int) $maxAge);
        // Chrome plafonne à 7 200 s : une valeur au-delà n'achète rien et retarderait d'autant un
        // changement de la configuration CORS côté navigateur.
        $this->assertLessThanOrEqual(7200, (int) $maxAge);
    }
}
