<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-634 — un `throttle:N,M` sans préfixe compte sous la signature de la requête, la même pour
 * tous ceux d'un visiteur (`sha1(domaine|ip)`). La page de connexion appelle `oauth/providers`
 * plusieurs fois à son affichage : la connexion qui suivait rendait 429 à la première tentative.
 */
class LoginRateLimitIsolationTest extends ApiTestCase
{
    use RefreshDatabase;

    private function tenterConnexion(): TestResponse
    {
        return $this->postJson('/api/auth/login', ['email' => 'personne@example.test', 'password' => 'mauvais-mot-de-passe']);
    }

    public function test_les_appels_oauth_de_la_page_ne_consomment_pas_le_quota_de_connexion(): void
    {
        User::factory()->create(['email' => 'personne@example.test']);

        foreach (range(1, 10) as $_) {
            $this->getJson('/api/auth/oauth/providers')->assertOk();
        }

        $this->tenterConnexion()->assertUnauthorized();
    }

    public function test_la_sixieme_tentative_de_connexion_en_dix_minutes_rend_429(): void
    {
        User::factory()->create(['email' => 'personne@example.test']);

        foreach (range(1, 5) as $i) {
            $this->tenterConnexion()->assertUnauthorized();
            $this->getJson('/api/auth/oauth/providers')->assertOk();
        }

        $this->tenterConnexion()->assertStatus(429);
    }

    public function test_oauth_rend_429_au_dela_de_soixante_appels_par_minute(): void
    {
        foreach (range(1, 3) as $_) {
            $this->tenterConnexion();
        }

        foreach (range(1, 60) as $_) {
            $this->getJson('/api/auth/oauth/providers')->assertOk();
        }

        $this->getJson('/api/auth/oauth/providers')->assertStatus(429);
    }

    /** Le recensement du ticket : la carte publique ne consomme pas le quota du numéro du bien. */
    public function test_la_carte_publique_ne_consomme_pas_le_quota_du_contact(): void
    {
        foreach (range(1, 21) as $_) {
            $this->getJson('/api/public/properties/map')->assertStatus(422);
        }

        $this->getJson('/api/public/properties/inconnu/contact')->assertNotFound();
    }
}
