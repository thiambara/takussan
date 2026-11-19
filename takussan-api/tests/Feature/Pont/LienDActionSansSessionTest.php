<?php

namespace Tests\Feature\Pont;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\ApiTestCase;
use Tests\Support\SceneDuLienDAction;

/**
 * TCK-2982 (ADR-0132 § 5) — sans session : aucune réponse du lien ne pose de cookie ni ne rend de jeton d'API, et
 * le geste n'ouvre aucune session pour la requête suivante.
 */
class LienDActionSansSessionTest extends ApiTestCase
{
    use RefreshDatabase;
    use SceneDuLienDAction;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->monterLaSceneDuLien();
    }

    public function test_ni_cookie_ni_jeton_d_api(): void
    {
        [$jeton] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer());
        $origine = ['Origin' => (string) config('app.frontend_url'), 'Referer' => (string) config('app.frontend_url').'/fr/fil/a/'.$jeton];

        foreach ([$this->getJson("/api/a/{$jeton}", $origine), $this->postJson("/api/a/{$jeton}", [], $origine)] as $reponse) {
            $reponse->assertOk();
            $this->assertSame([], $reponse->headers->getCookies(), 'aucun cookie');
            $corps = (string) $reponse->getContent();
            $this->assertStringNotContainsString('"token"', $corps);
            $this->assertStringNotContainsString('access_token', $corps);
        }
        $this->assertSame(0, PersonalAccessToken::query()->count());
    }

    public function test_le_geste_n_ouvre_aucune_session_pour_la_requete_suivante(): void
    {
        [$jeton] = $this->lien($this->bailleur, 'property_visit.confirm', $this->visiteAConfirmer());
        $this->postJson("/api/a/{$jeton}")->assertOk();
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/auth/me')->assertUnauthorized();
    }
}
