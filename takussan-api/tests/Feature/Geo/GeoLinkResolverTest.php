<?php

namespace Tests\Feature\Geo;

use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-633 (AC9) — un lien court (`maps.app.goo.gl/…`) se suit côté serveur, et c'est une requête
 * SORTANTE déclenchée par une saisie : la garde SSRF est le sujet du test, pas un détail.
 *
 * https seulement, ni identifiants ni port, hôte vérifié à CHAQUE saut, trois requêtes au plus,
 * aucune redirection suivie automatiquement. Un hôte de lecture (`www.google.com`) se lit sans
 * requête ; seuls les hôtes de redirection de Google sont appelés.
 */
class GeoLinkResolverTest extends TestCase
{
    use RefreshDatabase;

    private const FICHE = 'https://www.google.com/maps/place/Point+E/@14.69,-17.46,16z/data=!3m1!4b1!4m6!3m5!8m2!3d14.6964782!4d-17.4641817';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function resoudre(string $url): TestResponse
    {
        $this->actingAsRole('agent');

        return $this->postJson('/api/geo/resolve-link', ['url' => $url]);
    }

    private function redirection(string $vers): PromiseInterface
    {
        return Http::response('', 302, ['Location' => $vers]);
    }

    public function test_un_lien_court_se_resout_par_sa_redirection(): void
    {
        Http::fake(['maps.app.goo.gl/x7Jk2mN9pQ' => $this->redirection(self::FICHE)]);

        $this->resoudre('https://maps.app.goo.gl/x7Jk2mN9pQ')
            ->assertOk()
            ->assertJsonPath('data.latitude', 14.6964782)
            ->assertJsonPath('data.longitude', -17.4641817)
            ->assertJsonPath('data.outside_senegal', false);
        Http::assertSentCount(1);
    }

    public function test_deux_sauts_et_une_location_relative(): void
    {
        Http::fake([
            'maps.app.goo.gl/a' => $this->redirection('/b'),
            'maps.app.goo.gl/b' => $this->redirection('https://maps.google.com/maps?q=14.72046%2C-17.46744&z=17'),
        ]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertOk()->assertJsonPath('data.latitude', 14.72046);
        Http::assertSentCount(2);
    }

    public function test_au_dela_de_trois_requetes_on_renonce(): void
    {
        Http::fake([
            'maps.app.goo.gl/a' => $this->redirection('https://maps.app.goo.gl/b'),
            'maps.app.goo.gl/b' => $this->redirection('https://maps.app.goo.gl/c'),
            'maps.app.goo.gl/c' => $this->redirection('https://maps.app.goo.gl/d'),
            'maps.app.goo.gl/d' => $this->redirection(self::FICHE),
        ]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
        Http::assertSentCount(3);
    }

    public function test_une_redirection_vers_une_adresse_interne_est_refusee(): void
    {
        Http::fake(['maps.app.goo.gl/a' => $this->redirection('http://169.254.169.254/latest/meta-data/')]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
        Http::assertSentCount(1);
    }

    public function test_une_redirection_vers_un_hote_etranger_est_refusee_meme_avec_des_coordonnees(): void
    {
        Http::fake(['maps.app.goo.gl/a' => $this->redirection('https://evil.example/maps/@14.7,-17.4,15z')]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable();
        Http::assertSentCount(1);
    }

    public function test_la_page_de_consentement_se_lit_sans_requete(): void
    {
        $url = 'https://consent.google.com/ml?continue='.rawurlencode('https://www.google.com/maps/@14.6928,-17.4467,17z').'&gl=SN';

        $this->resoudre($url)->assertOk()->assertJsonPath('data.latitude', 14.6928);
        Http::assertNothingSent();
    }

    public function test_un_lien_long_se_lit_sans_requete(): void
    {
        $this->resoudre(self::FICHE)->assertOk()->assertJsonPath('data.longitude', -17.4641817);
        Http::assertNothingSent();
    }

    public function test_port_hote_inconnu_et_chemin_non_cartographique_sont_refuses_sans_requete(): void
    {
        $this->resoudre('https://maps.app.goo.gl:8443/x')->assertUnprocessable();
        $this->resoudre('https://example.com/maps/@14.7,-17.4,15z')->assertUnprocessable();
        $this->resoudre('https://goo.gl/abc')->assertUnprocessable();
        $this->resoudre('https://user:pass@maps.app.goo.gl/x')->assertUnprocessable();
        Http::assertNothingSent();
    }

    /**
     * L'hôte se compare EN ENTIER : un hôte qui COMMENCE par un hôte autorisé est un autre hôte.
     * Le faux répond comme Google le ferait : une garde qui comparerait par préfixe résoudrait
     * le lien — et aurait déjà parlé à `evil.com`.
     */
    public function test_un_hote_qui_prolonge_un_hote_autorise_est_refuse_sans_requete(): void
    {
        Http::fake(['*' => $this->redirection(self::FICHE)]);

        $this->resoudre('https://maps.app.goo.gl.evil.com/x')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
        $this->resoudre('https://maps.app.goo.gl./x')->assertUnprocessable();
        $this->resoudre('https://maps.google.com.evil.com/maps?q=14.7,-17.4')->assertUnprocessable();
        Http::assertNothingSent();
    }

    /**
     * https à CHAQUE saut, pas seulement sur l'URL saisie : une redirection vers `http://` d'un
     * hôte pourtant autorisé est refusée, même quand elle porterait des coordonnées lisibles.
     */
    public function test_une_redirection_vers_http_est_refusee_meme_vers_un_hote_autorise(): void
    {
        Http::fake(['maps.app.goo.gl/a' => $this->redirection('http://maps.google.com/maps?q=14.72046%2C-17.46744&z=17')]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
        Http::assertSentCount(1);
    }

    /**
     * Un hôte de LECTURE (`www.google.com`, `google.sn`…) se lit, il ne s'appelle pas : une fiche
     * sans coordonnées lisibles s'arrête là, sans seconde requête — même si Google y répondait
     * par une redirection exploitable. Seuls les hôtes de redirection sont appelés (ADR-0062 §6).
     */
    public function test_un_hote_de_lecture_ne_s_appelle_pas(): void
    {
        Http::fake([
            'maps.app.goo.gl/a' => $this->redirection('https://www.google.com/maps/place/x'),
            '*' => $this->redirection(self::FICHE),
        ]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
        Http::assertSentCount(1);
        Http::assertNotSent(fn ($requete) => str_starts_with($requete->url(), 'https://www.google.com/'));
    }

    /** Une requête sortante par appel : le point d'accès est limité (20 par minute). */
    public function test_au_dela_de_vingt_appels_par_minute_le_point_d_acces_refuse(): void
    {
        $this->actingAsRole('agent');
        for ($i = 0; $i < 20; $i++) {
            $this->postJson('/api/geo/resolve-link', ['url' => self::FICHE])->assertOk();
        }

        $this->postJson('/api/geo/resolve-link', ['url' => self::FICHE])->assertStatus(429);
        Http::assertNothingSent();
    }

    public function test_une_panne_reseau_rend_un_refus_lisible(): void
    {
        Http::fake(['maps.app.goo.gl/*' => fn () => throw new ConnectionException('délai dépassé')]);

        $this->resoudre('https://maps.app.goo.gl/a')->assertUnprocessable()->assertJsonPath('code', 'geo.link_unresolved');
    }

    public function test_une_position_hors_du_senegal_est_signalee(): void
    {
        Http::fake(['maps.app.goo.gl/paris' => $this->redirection('https://www.google.com/maps/@48.8566,2.3522,15z')]);

        $this->resoudre('https://maps.app.goo.gl/paris')->assertOk()->assertJsonPath('data.outside_senegal', true);
    }

    public function test_sans_compte_le_point_d_acces_est_ferme(): void
    {
        $this->postJson('/api/geo/resolve-link', ['url' => self::FICHE])->assertUnauthorized();
        Http::assertNothingSent();
    }
}
