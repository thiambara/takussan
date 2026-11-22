<?php

namespace Tests\Feature\Geo;

use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-2599 (ADR-0093) — le propriétaire qui commence son annonce SANS compte colle la position
 * que son voisin lui a envoyée sur WhatsApp. `POST /api/public/geo/resolve-link` : même corps,
 * même réponse, même contrôleur et même liste d'hôtes que la route connectée ; un limiteur nommé
 * par IP, plus serré (10 par minute) — la route déclenche une requête SORTANTE pour un anonyme.
 *
 * La garde SSRF elle-même (https à chaque saut, hôte comparé en entier, trois sauts) est éprouvée
 * par `GeoLinkResolverTest` : ce fichier vérifie que la porte publique passe par la même.
 */
class PublicGeoResolveLinkTest extends TestCase
{
    use RefreshDatabase;

    private const ROUTE = '/api/public/geo/resolve-link';

    private const FICHE = 'https://www.google.com/maps/place/Point+E/@14.69,-17.46,16z/data=!3m1!4b1!4m6!3m5!8m2!3d14.6964782!4d-17.4641817';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function redirection(string $vers): PromiseInterface
    {
        return Http::response('', 302, ['Location' => $vers]);
    }

    /** AC1 — sans jeton, la même réponse que la route connectée, et rien d'écrit en base. */
    public function test_un_anonyme_resout_un_lien_court_comme_un_utilisateur_connecte(): void
    {
        Http::fake(['maps.app.goo.gl/x7Jk2mN9pQ' => $this->redirection(self::FICHE)]);

        $ecritures = [];
        DB::listen(function ($requete) use (&$ecritures) {
            if (preg_match('/^\s*(insert|update|delete)\b/i', $requete->sql) === 1) {
                $ecritures[] = $requete->sql;
            }
        });

        $public = $this->postJson(self::ROUTE, ['url' => 'https://maps.app.goo.gl/x7Jk2mN9pQ'])
            ->assertOk()
            ->assertJsonPath('data.latitude', 14.6964782)
            ->assertJsonPath('data.longitude', -17.4641817)
            ->assertJsonPath('data.outside_senegal', false);
        $this->assertSame([], $ecritures, 'la résolution publique n\'écrit rien en base');
        $this->assertGuest('sanctum');

        $this->actingAsRole('agent');
        $connecte = $this->postJson('/api/geo/resolve-link', ['url' => 'https://maps.app.goo.gl/x7Jk2mN9pQ'])->assertOk();

        $this->assertSame($connecte->json('data'), $public->json('data'));
        Http::assertSentCount(2);
    }

    /** Une position WhatsApp partagée est un lien `maps.google.com/maps?q=lat,lng`. */
    public function test_une_position_whatsapp_se_resout_sans_compte(): void
    {
        Http::fake(['maps.app.goo.gl/w' => $this->redirection('https://maps.google.com/maps?q=14.72046%2C-17.46744&z=17')]);

        $this->postJson(self::ROUTE, ['url' => 'https://maps.app.goo.gl/w'])
            ->assertOk()
            ->assertJsonPath('data.latitude', 14.72046)
            ->assertJsonPath('data.longitude', -17.46744);
    }

    /** AC2 — un hôte hors liste : 422, et le faux client n'a reçu aucune requête. */
    public function test_un_hote_non_suivi_est_refuse_sans_requete_sortante(): void
    {
        Http::fake(['*' => $this->redirection(self::FICHE)]);

        $this->postJson(self::ROUTE, ['url' => 'https://evil.example/maps/@14.7,-17.4,15z'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'geo.link_unresolved');
        $this->postJson(self::ROUTE, ['url' => 'https://maps.app.goo.gl.evil.com/x'])->assertUnprocessable();
        $this->postJson(self::ROUTE, ['url' => 'http://169.254.169.254/latest/meta-data/'])->assertUnprocessable();

        Http::assertNothingSent();
    }

    /** AC3 — dix appels par minute et par IP ; le onzième rend 429, une autre IP passe encore. */
    public function test_le_onzieme_appel_d_une_meme_ip_dans_la_minute_rend_429(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson(self::ROUTE, ['url' => self::FICHE])->assertOk();
        }

        $this->postJson(self::ROUTE, ['url' => self::FICHE])->assertStatus(429);

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.7'])
            ->postJson(self::ROUTE, ['url' => self::FICHE])
            ->assertOk();
        Http::assertNothingSent();
    }

    /** La route connectée garde son propre limiteur : épuiser la porte publique ne la ferme pas. */
    public function test_epuiser_la_porte_publique_ne_ferme_pas_la_route_connectee(): void
    {
        for ($i = 0; $i < 11; $i++) {
            $this->postJson(self::ROUTE, ['url' => self::FICHE]);
        }

        $this->actingAsRole('agent');
        $this->postJson('/api/geo/resolve-link', ['url' => self::FICHE])->assertOk();
    }

    public function test_le_corps_est_valide_comme_sur_la_route_connectee(): void
    {
        $this->postJson(self::ROUTE, [])->assertUnprocessable()->assertJsonValidationErrors('url');
        $this->postJson(self::ROUTE, ['url' => 'http://maps.app.goo.gl/x'])->assertUnprocessable()->assertJsonValidationErrors('url');
        Http::assertNothingSent();
    }
}
