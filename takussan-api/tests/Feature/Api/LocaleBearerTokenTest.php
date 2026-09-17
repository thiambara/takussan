<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-536 — la langue d'un appel authentifié par **jeton Bearer**, le chemin réel du front.
 *
 * ⚠️ `LocaleMiddlewareTest` passe par `Sanctum::actingAs()`, qui fait `shouldUse('sanctum')` :
 * la garde par défaut devient `sanctum` AVANT la requête, et `$request->user()` répond dans
 * `SetLocaleMiddleware`. Un vrai jeton ne fait rien de tel — la garde par défaut reste `web`
 * jusqu'à `auth:sanctum`, qui tourne APRÈS le groupe `api`. `preferred_language` y était donc
 * lu sur un utilisateur toujours `null`, et ces tests-là restaient verts.
 *
 * Ici aucun `actingAs` : le jeton part en en-tête, comme depuis `apiRequest`. L'observable est la
 * prose de validation rendue par Laravel, pas `app()->getLocale()` après coup.
 *
 * `Accept-Language: de` neutralise l'en-tête que `Request::create()` injecte toujours
 * (`en-us,en;q=0.5`, cf. `SetLocaleMiddlewareTest`) sans en fournir un qui soit supporté.
 */
class LocaleBearerTokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_preferred_language_sapplique_a_un_appel_par_jeton_bearer(): void
    {
        $response = $this->appelSansPrenom('wo', ['Accept-Language' => 'de']);

        $response->assertStatus(422);
        $this->assertStringContainsString('Barabu', $response->json('errors.first_name.0'));
    }

    public function test_accept_language_supporte_lemporte_sur_preferred_language(): void
    {
        $response = $this->appelSansPrenom('wo', ['Accept-Language' => 'fr-FR,fr;q=0.9']);

        $response->assertStatus(422);
        $this->assertStringContainsString('est obligatoire', $response->json('errors.first_name.0'));
    }

    public function test_le_parametre_lang_lemporte_sur_tout(): void
    {
        $response = $this->appelSansPrenom('wo', ['Accept-Language' => 'en'], '?lang=fr');

        $response->assertStatus(422);
        $this->assertStringContainsString('est obligatoire', $response->json('errors.first_name.0'));
    }

    /** @param array<string, string> $enTetes */
    private function appelSansPrenom(string $langueDuCompte, array $enTetes, string $requete = ''): TestResponse
    {
        $user = User::factory()->create(['preferred_language' => $langueDuCompte]);
        $jeton = $user->createToken('test')->plainTextToken;

        return $this->withToken($jeton)
            ->withHeaders($enTetes)
            ->putJson('/api/auth/profile'.$requete, ['last_name' => 'Diop']);
    }
}
