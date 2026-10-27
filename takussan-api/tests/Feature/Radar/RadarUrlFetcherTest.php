<?php

namespace Tests\Feature\Radar;

use App\Services\Radar\BoundedSink;
use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use App\Services\Radar\FetchedImage;
use App\Services\Radar\HostResolver;
use App\Services\Radar\UrlFetcher;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0077 §10) — lire une URL sans s'exposer : SSRF contrôlée à chaque saut, connexion
 * épinglée sur l'adresse contrôlée, `robots.txt`, délai par domaine, corps et redirections bornés.
 *
 * Aucun test ne touche le réseau : `Http::preventStrayRequests()` et un résolveur DNS doublé.
 */
class RadarUrlFetcherTest extends TestCase
{
    private const PUBLIC_IP = '93.184.216.34';

    private const HOST = 'sn.coinafrique.com';

    private const UA = 'TakussanRadar/1.0 (+https://takussan.com)';

    /** @var array<string, list<string>> */
    private array $dns = [];

    /** @var list<string> */
    private array $resolved = [];

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        Cache::flush();
        config(['radar.fetch.user_agent' => self::UA]);

        $this->dns = [self::HOST => [self::PUBLIC_IP]];
        $test = $this;
        $this->app->instance(HostResolver::class, new class($test) implements HostResolver
        {
            public function __construct(private RadarUrlFetcherTest $test) {}

            public function resolve(string $host): array
            {
                return $this->test->resolveForTest($host);
            }
        });
    }

    /** @return list<string> */
    public function resolveForTest(string $host): array
    {
        $this->resolved[] = $host;

        return $this->dns[$host] ?? [];
    }

    private function fetcher(): UrlFetcher
    {
        return $this->app->make(UrlFetcher::class);
    }

    private function refusalOf(string $url): string
    {
        try {
            $this->fetcher()->fetch($url);
        } catch (RadarFetchRefused $e) {
            return $e->code;
        }

        $this->fail("L'URL {$url} aurait dû être refusée.");
    }

    private function html(string $body = '<html><body>Appartement F3 Almadies</body></html>', int $status = 200): PromiseInterface
    {
        return Http::response($body, $status, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    // ── Le chemin nominal ──────────────────────────────────────────────────────────────────

    public function test_une_page_publique_est_lue_avec_son_user_agent_et_robots_absent(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/annonce/42' => $this->html(),
        ]);

        $page = $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/42');

        $this->assertSame('https://sn.coinafrique.com/annonce/42', $page->url);
        $this->assertSame(200, $page->status);
        $this->assertStringContainsString('Almadies', $page->body);
        $this->assertSame('text/html; charset=utf-8', $page->contentType);

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $r) => $r->url() === 'https://sn.coinafrique.com/annonce/42'
            && $r->header('User-Agent') === [self::UA]);
        Http::assertSent(fn (Request $r) => $r->url() === 'https://sn.coinafrique.com/robots.txt'
            && $r->header('User-Agent') === [self::UA]);
    }

    public function test_une_redirection_relative_est_suivie_et_l_url_finale_rendue(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/a' => Http::response('', 301, ['Location' => '/b?x=1']),
            'https://sn.coinafrique.com/b?x=1' => $this->html(),
        ]);

        $page = $this->fetcher()->fetch('https://sn.coinafrique.com/a');

        $this->assertSame('https://sn.coinafrique.com/b?x=1', $page->url);
    }

    // ── SSRF : l'URL de départ ─────────────────────────────────────────────────────────────

    /** @return array<string, array{string}> */
    public static function privateUrls(): array
    {
        return [
            'IPv4 privée 10/8' => ['http://10.0.0.5/annonce'],
            'IPv4 privée 192.168/16' => ['http://192.168.1.1/'],
            'IPv4 privée 172.16/12' => ['http://172.20.0.1/'],
            'boucle locale' => ['http://127.0.0.1/'],
            'métadonnées 169.254.169.254' => ['http://169.254.169.254/latest/meta-data/'],
            'CGNAT 100.64/10' => ['http://100.64.0.1/'],
            '0/8' => ['http://0.0.0.0/'],
            'multicast 224/4' => ['http://224.0.0.1/'],
            'au-delà de 240/4' => ['http://255.255.255.255/'],
            'IPv6 boucle' => ['http://[::1]/'],
            'IPv6 non spécifiée' => ['http://[::]/'],
            'IPv6 unique locale' => ['http://[fd00::1]/'],
            'IPv6 lien local' => ['http://[fe80::1]/'],
            'IPv4 mappée en IPv6' => ['http://[::ffff:127.0.0.1]/'],
            'IPv4 mappée en IPv6, forme hexadécimale' => ['http://[::ffff:a9fe:a9fe]/'],
            'localhost' => ['http://localhost/'],
            'sous-domaine de localhost' => ['http://admin.localhost/'],
            'localhost en capitales, point final' => ['http://LOCALHOST./'],
            '6to4 2002::/16 vers 127.0.0.1' => ['http://[2002:7f00:1::1]/'],
            '6to4 2002::/16 vers 192.168.1.1' => ['http://[2002:c0a8:101::1]/'],
            'Teredo 2001::/32' => ['http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/'],
            'NAT64 local 64:ff9b:1::/48' => ['http://[64:ff9b:1::a9fe:a9fe]/'],
            'relais 6to4 192.88.99.0/24' => ['http://192.88.99.1/'],
            'SRv6 5f00::/8' => ['http://[5f00::1]/'],
            'documentation 3fff::/20' => ['http://[3fff::1]/'],
            'ORCHID 2001:10::/28' => ['http://[2001:10::1]/'],
            'ORCHIDv2 2001:20::/28' => ['http://[2001:20::1]/'],
            'chiffres pleine chasse (IDN)' => ['http://１２７.０.０.１/'],
            'points idéographiques (IDN)' => ['http://127。0。0。1/'],
        ];
    }

    #[DataProvider('privateUrls')]
    public function test_une_adresse_privee_ou_reservee_est_refusee_sans_rien_contacter(string $url): void
    {
        Http::fake();

        $this->assertSame('radar.fetch.private_address', $this->refusalOf($url));
        Http::assertNothingSent();
    }

    public function test_localhost_est_refuse_sans_resolution(): void
    {
        Http::fake();

        $this->refusalOf('http://localhost/');
        $this->refusalOf('http://x.localhost/');

        $this->assertSame([], $this->resolved);
    }

    public function test_un_nom_qui_resout_en_prive_est_refuse(): void
    {
        Http::fake();
        $this->dns['interne.example.com'] = ['10.1.2.3'];

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://interne.example.com/'));
        Http::assertNothingSent();
    }

    public function test_un_nom_qui_resout_en_mixte_public_et_prive_est_refuse(): void
    {
        Http::fake();
        $this->dns['mixte.example.com'] = [self::PUBLIC_IP, '169.254.169.254'];

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://mixte.example.com/'));
        Http::assertNothingSent();
    }

    public function test_un_nom_qui_resout_en_ipv6_privee_est_refuse(): void
    {
        Http::fake();
        $this->dns['v6.example.com'] = ['2001:4860:4860::8888', 'fc00::5'];

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://v6.example.com/'));
        Http::assertNothingSent();
    }

    public function test_un_nom_qui_resout_en_6to4_vers_une_adresse_privee_est_refuse(): void
    {
        Http::fake();
        $this->dns['sixtofour.example.com'] = ['2002:7f00:1::1'];

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://sixtofour.example.com/'));
        Http::assertNothingSent();
    }

    public function test_un_litteral_idn_ne_part_pas_au_resolveur(): void
    {
        Http::fake();

        $this->refusalOf('http://１２７.０.０.１/');
        $this->refusalOf('http://127。0。0。1/');

        $this->assertSame([], $this->resolved);
    }

    public function test_un_nom_qui_ne_resout_pas_est_refuse(): void
    {
        Http::fake();

        $this->assertSame('radar.fetch.unresolvable', $this->refusalOf('https://inconnu.example.com/'));
        Http::assertNothingSent();
    }

    // ── AC1 : une redirection vers une adresse privée — la cible n'est JAMAIS contactée ────

    public function test_ac1_une_redirection_vers_les_metadonnees_est_refusee_et_la_cible_jamais_contactee(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/piege' => Http::response('', 302, [
                'Location' => 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
            ]),
            '169.254.169.254/*' => Http::response('{"AccessKeyId":"secret"}', 200),
        ]);

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://sn.coinafrique.com/piege'));

        Http::assertNotSent(fn (Request $r) => parse_url($r->url(), PHP_URL_HOST) === '169.254.169.254');
        Http::assertSentCount(2);
    }

    public function test_ac1_une_redirection_vers_un_nom_qui_resout_en_prive_est_refusee_et_la_cible_jamais_contactee(): void
    {
        $this->dns['intranet.example.com'] = ['192.168.0.10'];
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/piege' => Http::response('', 301, ['Location' => 'https://intranet.example.com/admin']),
            'intranet.example.com/*' => $this->html(),
        ]);

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://sn.coinafrique.com/piege'));

        Http::assertNotSent(fn (Request $r) => parse_url($r->url(), PHP_URL_HOST) === 'intranet.example.com');
        Http::assertSentCount(2);
    }

    public function test_une_redirection_vers_un_autre_schema_est_refusee(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/piege' => Http::response('', 302, ['Location' => 'file:///etc/passwd']),
        ]);

        $this->assertSame('radar.fetch.invalid_url', $this->refusalOf('https://sn.coinafrique.com/piege'));
        Http::assertSentCount(2);
    }

    // ── L'épinglage : la connexion part vers l'adresse contrôlée, pas vers une seconde résolution

    public function test_les_options_epinglent_la_connexion_sur_l_adresse_controlee(): void
    {
        $options = $this->fetcher()->requestOptions('sn.coinafrique.com', 443, [self::PUBLIC_IP]);

        $this->assertSame(['sn.coinafrique.com:443:'.self::PUBLIC_IP], $options['curl'][CURLOPT_RESOLVE]);
        $this->assertFalse($options['allow_redirects']);
        $this->assertSame('', $options['proxy'], 'Un mandataire résoudrait le nom lui-même : l\'épinglage serait perdu.');
        $this->assertSame(10, $options['timeout']);
        $this->assertSame(5, $options['connect_timeout']);
    }

    public function test_l_epinglage_met_une_ipv6_entre_crochets_et_garde_toutes_les_adresses_controlees(): void
    {
        $options = $this->fetcher()->requestOptions('sn.coinafrique.com', 80, [self::PUBLIC_IP, '2606:2800:220:1::1']);

        $this->assertSame(
            ['sn.coinafrique.com:80:'.self::PUBLIC_IP.',[2606:2800:220:1::1]'],
            $options['curl'][CURLOPT_RESOLVE],
        );
    }

    public function test_la_page_est_demandee_avec_les_options_d_epinglage(): void
    {
        $seen = [];
        Http::fake(function (Request $request, array $options) use (&$seen) {
            $seen[] = $options;

            return str_ends_with($request->url(), '/robots.txt')
                ? Http::response('', 404)
                : $this->html();
        });

        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/42');

        $this->assertCount(2, $seen);
        foreach ($seen as $options) {
            $this->assertSame(['sn.coinafrique.com:443:'.self::PUBLIC_IP], $options['curl'][CURLOPT_RESOLVE]);
            $this->assertFalse($options['allow_redirects']);
            $this->assertInstanceOf(BoundedSink::class, $options['sink']);
        }
    }

    // ── L'URL elle-même ────────────────────────────────────────────────────────────────────

    /** @return array<string, array{string}> */
    public static function invalidUrls(): array
    {
        return [
            'schéma ftp' => ['ftp://sn.coinafrique.com/x'],
            'schéma file' => ['file:///etc/passwd'],
            'schéma gopher' => ['gopher://sn.coinafrique.com/'],
            'sans hôte' => ['https:///annonce'],
            'pas une URL' => ['annonce coinafrique'],
            'port 8080' => ['https://sn.coinafrique.com:8080/'],
            'port 22' => ['http://sn.coinafrique.com:22/'],
            'identifiants dans l\'URL' => ['https://user:pass@sn.coinafrique.com/'],
            'IPv4 en décimal' => ['http://2130706433/'],
            'IPv4 en hexadécimal' => ['http://0x7f.0.0.1/'],
            'IPv4 en octal' => ['http://0177.0.0.1/'],
        ];
    }

    #[DataProvider('invalidUrls')]
    public function test_une_url_invalide_est_refusee(string $url): void
    {
        Http::fake();

        $this->assertSame('radar.fetch.invalid_url', $this->refusalOf($url));
        Http::assertNothingSent();
    }

    public function test_les_ports_80_et_443_explicites_sont_acceptes(): void
    {
        Http::fake([
            'http://sn.coinafrique.com:80/robots.txt' => Http::response('', 404),
            'http://sn.coinafrique.com:80/a' => $this->html(),
            'http://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'http://sn.coinafrique.com/a' => $this->html(),
        ]);

        $page = $this->fetcher()->fetch('http://sn.coinafrique.com:80/a');

        $this->assertSame(200, $page->status);
    }

    // ── Airbnb ─────────────────────────────────────────────────────────────────────────────

    /** @return array<string, array{string}> */
    public static function airbnbUrls(): array
    {
        return [
            'airbnb.com' => ['https://airbnb.com/rooms/1'],
            'www.airbnb.fr' => ['https://www.airbnb.fr/rooms/1'],
            'airbnb.co.uk' => ['https://airbnb.co.uk/rooms/1'],
            'fr.airbnb.ca' => ['https://fr.airbnb.ca/rooms/1'],
            'abnb.me' => ['https://abnb.me/xyz'],
            'sous-domaine abnb.me' => ['https://www.abnb.me/xyz'],
            'capitales' => ['https://WWW.AIRBNB.COM/rooms/1'],
        ];
    }

    #[DataProvider('airbnbUrls')]
    public function test_airbnb_est_refuse_avant_toute_resolution(string $url): void
    {
        Http::fake();

        $this->assertSame('radar.fetch.airbnb', $this->refusalOf($url));
        $this->assertSame([], $this->resolved);
        Http::assertNothingSent();
    }

    public function test_airbnb_est_reconnu_par_son_nom_d_hote_et_pas_par_un_suffixe_de_texte(): void
    {
        $this->assertTrue(UrlFetcher::isAirbnb('airbnb.sn'));
        $this->assertTrue(UrlFetcher::isAirbnb('www.airbnb.com.br'));
        $this->assertFalse(UrlFetcher::isAirbnb('notairbnb.com'));
        $this->assertFalse(UrlFetcher::isAirbnb('airbnb-dakar.sn'));
        $this->assertFalse(UrlFetcher::isAirbnb('sn.coinafrique.com'));
        $this->assertFalse(UrlFetcher::isAirbnb('fakeabnb.me'));
    }

    public function test_une_redirection_vers_airbnb_est_refusee(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/a' => Http::response('', 302, ['Location' => 'https://www.airbnb.com/rooms/1']),
        ]);

        $this->assertSame('radar.fetch.airbnb', $this->refusalOf('https://sn.coinafrique.com/a'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'airbnb'));
    }

    // ── robots.txt ─────────────────────────────────────────────────────────────────────────

    public function test_un_robots_txt_qui_interdit_refuse_la_page_sans_la_demander(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response("User-agent: *\nDisallow: /annonce/\n", 200, ['Content-Type' => 'text/plain']),
            'https://sn.coinafrique.com/annonce/*' => $this->html(),
        ]);

        $this->assertSame('radar.fetch.robots', $this->refusalOf('https://sn.coinafrique.com/annonce/42'));
        Http::assertSentCount(1);
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/annonce/'));
    }

    public function test_un_robots_txt_qui_nomme_le_radar_s_applique(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response("User-agent: TakussanRadar\nDisallow: /\n\nUser-agent: *\nAllow: /\n"),
        ]);

        $this->assertSame('radar.fetch.robots', $this->refusalOf('https://sn.coinafrique.com/annonce/42'));
    }

    public function test_un_robots_txt_injoignable_en_5xx_refuse_tout(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 503),
            'https://sn.coinafrique.com/annonce/*' => $this->html(),
        ]);

        $this->assertSame('radar.fetch.robots_unavailable', $this->refusalOf('https://sn.coinafrique.com/annonce/42'));
        Http::assertSentCount(1);
    }

    public function test_un_robots_txt_sans_reponse_refuse_tout(): void
    {
        Http::fake(function (Request $request) {
            if (str_ends_with($request->url(), '/robots.txt')) {
                throw new ConnectionException('cURL error 7: Failed to connect');
            }

            return $this->html();
        });

        $this->assertSame('radar.fetch.robots_unavailable', $this->refusalOf('https://sn.coinafrique.com/annonce/42'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/annonce/'));
    }

    public function test_un_robots_txt_qui_redirige_vers_une_adresse_privee_refuse_tout_sans_la_contacter(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 302, ['Location' => 'http://127.0.0.1/robots.txt']),
            '127.0.0.1/*' => Http::response("User-agent: *\nAllow: /\n"),
        ]);

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://sn.coinafrique.com/annonce/42'));
        Http::assertNotSent(fn (Request $r) => parse_url($r->url(), PHP_URL_HOST) === '127.0.0.1');
    }

    public function test_un_robots_txt_redirige_vers_un_autre_hote_est_suivi_et_s_applique(): void
    {
        $this->dns['www.coinafrique.com'] = [self::PUBLIC_IP];
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 301, ['Location' => 'https://www.coinafrique.com/robots.txt']),
            'https://www.coinafrique.com/robots.txt' => Http::response("User-agent: *\nDisallow: /annonce/\n"),
            'https://sn.coinafrique.com/*' => $this->html(),
        ]);

        $this->assertSame('radar.fetch.robots', $this->refusalOf('https://sn.coinafrique.com/annonce/42'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/annonce/'));
    }

    public function test_un_robots_txt_redirige_vers_un_autre_hote_prend_le_creneau_de_cet_hote(): void
    {
        $this->dns['www.coinafrique.com'] = [self::PUBLIC_IP];
        Http::fake([
            'https://www.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://www.coinafrique.com/*' => $this->html(),
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 301, ['Location' => 'https://www.coinafrique.com/robots.txt']),
            'https://sn.coinafrique.com/*' => $this->html(),
        ]);

        $this->fetcher()->fetch('https://www.coinafrique.com/annonce/1');

        $this->expectException(RadarFetchDeferred::class);
        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/42');
    }

    public function test_une_lecture_longue_garde_son_creneau_jusqu_au_bout(): void
    {
        // Le pire cas d'une lecture : le délai total (45 s), plus une requête en marge — 60 s
        // avec la configuration livrée. Le verrou ne doit pas expirer avant.
        $nested = null;
        Http::fake(function (Request $request) use (&$nested) {
            if (str_ends_with($request->url(), '/robots.txt')) {
                return Http::response('', 404);
            }

            if ($nested === null) {
                $nested = 'pas différée';
                $this->travel(59)->seconds();
                try {
                    $this->fetcher()->fetch('https://sn.coinafrique.com/autre');
                } catch (RadarFetchDeferred) {
                    $nested = 'différée';
                }
            }

            return $this->html();
        });

        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/1');

        $this->assertSame('différée', $nested);
    }

    public function test_le_robots_txt_est_garde_en_cache_par_domaine(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response("User-agent: *\nDisallow: /prive\n"),
            'https://sn.coinafrique.com/*' => $this->html(),
        ]);

        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/1');
        $this->travel(6)->seconds();
        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/2');

        Http::assertSentCount(3);
        $robots = collect(Http::recorded())->filter(fn ($pair) => str_ends_with($pair[0]->url(), '/robots.txt'));
        $this->assertCount(1, $robots);
    }

    // ── Bornes ─────────────────────────────────────────────────────────────────────────────

    public function test_trop_de_redirections_sont_refusees(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/r0' => Http::response('', 302, ['Location' => '/r1']),
            'https://sn.coinafrique.com/r1' => Http::response('', 302, ['Location' => '/r2']),
            'https://sn.coinafrique.com/r2' => Http::response('', 302, ['Location' => '/r3']),
            'https://sn.coinafrique.com/r3' => Http::response('', 302, ['Location' => '/r4']),
            'https://sn.coinafrique.com/r4' => $this->html(),
        ]);

        $this->assertSame('radar.fetch.too_many_redirects', $this->refusalOf('https://sn.coinafrique.com/r0'));
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/r4'));
    }

    public function test_trois_redirections_sont_suivies(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/r0' => Http::response('', 302, ['Location' => '/r1']),
            'https://sn.coinafrique.com/r1' => Http::response('', 302, ['Location' => '/r2']),
            'https://sn.coinafrique.com/r2' => Http::response('', 302, ['Location' => '/r3']),
            'https://sn.coinafrique.com/r3' => $this->html(),
        ]);

        $this->assertSame('https://sn.coinafrique.com/r3', $this->fetcher()->fetch('https://sn.coinafrique.com/r0')->url);
    }

    public function test_un_corps_annonce_trop_gros_est_refuse(): void
    {
        config(['radar.fetch.max_bytes' => 100]);
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/a' => Http::response('<html></html>', 200, [
                'Content-Type' => 'text/html',
                'Content-Length' => '5000000',
            ]),
        ]);

        $this->assertSame('radar.fetch.too_large', $this->refusalOf('https://sn.coinafrique.com/a'));
    }

    public function test_un_corps_lu_trop_gros_est_refuse_meme_sans_content_length(): void
    {
        config(['radar.fetch.max_bytes' => 100]);
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/a' => $this->html('<html><body>'.str_repeat('x', 200).'</body></html>'),
        ]);

        $this->assertSame('radar.fetch.too_large', $this->refusalOf('https://sn.coinafrique.com/a'));
    }

    public function test_le_tampon_borne_refuse_d_ecrire_au_dela_de_la_borne(): void
    {
        // Ce que `Http::fake()` ne prouve pas : le vrai client écrit le corps dans ce tampon au fil
        // de l'eau (option `sink`), et un `write()` qui rend moins d'octets que reçus fait
        // interrompre le transfert par cURL (CURLE_WRITE_ERROR). La mémoire reste bornée.
        $sink = new BoundedSink(10);

        $this->assertSame(6, $sink->write('abcdef'));
        $this->assertFalse($sink->exceeded);
        $this->assertSame(0, $sink->write('ghijk'));
        $this->assertTrue($sink->exceeded);
        $this->assertSame(6, $sink->getSize());
    }

    public function test_un_contenu_qui_n_est_pas_du_html_est_refuse(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/a.json' => Http::response('{"a":1}', 200, ['Content-Type' => 'application/json']),
        ]);

        $this->assertSame('radar.fetch.not_html', $this->refusalOf('https://sn.coinafrique.com/a.json'));
    }

    public function test_le_xhtml_est_accepte(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/a' => Http::response('<html></html>', 200, ['Content-Type' => 'application/xhtml+xml']),
        ]);

        $this->assertSame(200, $this->fetcher()->fetch('https://sn.coinafrique.com/a')->status);
    }

    public function test_sans_content_type_le_corps_doit_ressembler_a_du_html(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/html' => Http::response("  <!DOCTYPE html>\n<html><body>ok</body></html>"),
            'https://sn.coinafrique.com/binaire' => Http::response("\x89PNG\r\n\x1a\n"),
        ]);

        $this->assertNull($this->fetcher()->fetch('https://sn.coinafrique.com/html')->contentType);

        $this->travel(6)->seconds();
        $this->assertSame('radar.fetch.not_html', $this->refusalOf('https://sn.coinafrique.com/binaire'));
    }

    public function test_une_erreur_http_est_refusee(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/a' => $this->html('<html>introuvable</html>', 404),
        ]);

        $this->assertSame('radar.fetch.http_error', $this->refusalOf('https://sn.coinafrique.com/a'));
    }

    public function test_un_delai_depasse_est_refuse(): void
    {
        Http::fake(function (Request $request) {
            if (str_ends_with($request->url(), '/robots.txt')) {
                return Http::response('', 404);
            }

            throw new ConnectionException('cURL error 28: Operation timed out after 10001 milliseconds');
        });

        $this->assertSame('radar.fetch.timeout', $this->refusalOf('https://sn.coinafrique.com/a'));
    }

    public function test_un_delai_depasse_est_reconnu_par_le_code_d_erreur_curl(): void
    {
        Http::fake(function (Request $request) {
            if (str_ends_with($request->url(), '/robots.txt')) {
                return Http::response('', 404);
            }

            $previous = new ConnectException(
                'opaque',
                new \GuzzleHttp\Psr7\Request('GET', $request->url()),
                null,
                ['errno' => CURLE_OPERATION_TIMEDOUT],
            );

            throw new ConnectionException('opaque', 0, $previous);
        });

        $this->assertSame('radar.fetch.timeout', $this->refusalOf('https://sn.coinafrique.com/a'));
    }

    // ── F5 (revue finale) : un délai total pour toute la lecture ───────────────────────────

    public function test_f5_une_chaine_de_sauts_qui_depasse_le_delai_total_est_refusee_sans_requete_de_plus(): void
    {
        // Chaque requête prend 20 s : robots, /a (301), /b (301) → 60 s, au-delà des 45 s.
        Http::fake(function (Request $request) {
            $this->travel(20)->seconds();

            return match (true) {
                str_ends_with($request->url(), '/robots.txt') => Http::response('', 404),
                str_ends_with($request->url(), '/a') => Http::response('', 301, ['Location' => '/b']),
                str_ends_with($request->url(), '/b') => Http::response('', 301, ['Location' => '/c']),
                default => $this->html(),
            };
        });

        $this->assertSame('radar.fetch.timeout', $this->refusalOf('https://sn.coinafrique.com/a'));
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/b'));
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/c'));
    }

    public function test_f5_chaque_requete_n_a_que_le_temps_qui_reste(): void
    {
        $delais = [];
        Http::fake(function (Request $request, array $options) use (&$delais) {
            $delais[] = [$options['timeout'], $options['connect_timeout']];
            if (str_ends_with($request->url(), '/robots.txt')) {
                $this->travel(42)->seconds();

                return Http::response('', 404);
            }

            return $this->html();
        });

        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/1');

        $this->assertSame([10, 5], $delais[0]);
        $this->assertEqualsWithDelta(3.0, $delais[1][0], 0.5);
        $this->assertEqualsWithDelta(3.0, $delais[1][1], 0.5);
    }

    public function test_f5_le_delai_total_passe_pendant_le_robots_txt_est_un_delai_pas_un_robots_injoignable(): void
    {
        $this->dns['www.coinafrique.com'] = [self::PUBLIC_IP];
        Http::fake(function (Request $request) {
            $this->travel(46)->seconds();

            return Http::response('', 301, ['Location' => 'https://www.coinafrique.com/robots.txt']);
        });

        $this->assertSame('radar.fetch.timeout', $this->refusalOf('https://sn.coinafrique.com/annonce/1'));
    }

    public function test_f5_une_redirection_recue_apres_le_delai_total_ne_resout_pas_son_hote(): void
    {
        // La résolution DNS n'a pas de délai propre : passé l'échéance, le saut suivant n'est plus résolu.
        $this->dns['www.coinafrique.com'] = [self::PUBLIC_IP];
        Http::fake(function (Request $request) {
            if (str_ends_with($request->url(), '/robots.txt')) {
                return Http::response('', 404);
            }
            $this->travel(46)->seconds();

            return Http::response('', 301, ['Location' => 'https://www.coinafrique.com/annonce/1']);
        });

        $this->assertSame('radar.fetch.timeout', $this->refusalOf('https://sn.coinafrique.com/annonce/1'));
        $this->assertNotContains('www.coinafrique.com', $this->resolved);
    }

    public function test_f5_le_creneau_du_domaine_est_borne_par_le_delai_total(): void
    {
        // Un worker tué en pleine lecture ne relâche rien : le créneau doit expirer de lui-même,
        // au délai total plus une requête en marge (5 + 45 + 10 + 5 = 65 s), pas à 305 s.
        $jusqua = null;
        $maintenant = null;
        Http::fake(function (Request $request) use (&$jusqua, &$maintenant) {
            $jusqua ??= Cache::get('radar:fetch:'.self::HOST);
            $maintenant ??= now()->getTimestamp();

            return str_ends_with($request->url(), '/robots.txt') ? Http::response('', 404) : $this->html();
        });

        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/1');

        $this->assertIsInt($jusqua);
        $this->assertLessThanOrEqual($maintenant + 65, $jusqua);
        $this->assertGreaterThanOrEqual($maintenant + 60, $jusqua);
    }

    // ── Délai par domaine ──────────────────────────────────────────────────────────────────

    public function test_un_domaine_lu_il_y_a_moins_du_delai_minimal_est_differe(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/*' => $this->html(),
        ]);

        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/1');

        try {
            $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/2');
            $this->fail('La seconde lecture aurait dû être différée.');
        } catch (RadarFetchDeferred $e) {
            $this->assertGreaterThanOrEqual(1, $e->retryAfterSeconds);
            $this->assertLessThanOrEqual(5, $e->retryAfterSeconds);
        }

        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/annonce/2'));

        $this->travel(6)->seconds();
        $this->assertSame(200, $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/2')->status);
    }

    public function test_le_delai_est_propre_a_chaque_domaine(): void
    {
        $this->dns['www.expat-dakar.com'] = [self::PUBLIC_IP];
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            '*' => $this->html(),
        ]);

        $this->fetcher()->fetch('https://sn.coinafrique.com/annonce/1');
        $this->assertSame(200, $this->fetcher()->fetch('https://www.expat-dakar.com/annonce/1')->status);
    }

    public function test_un_refus_avant_tout_contact_ne_consomme_pas_le_delai(): void
    {
        // Pas de `Http::fake()` ici : un faux sans motif répond à tout, et il précéderait celui
        // d'en dessous. `preventStrayRequests()` ferait lever toute requête partie quand même.
        $this->dns['www.expat-dakar.com'] = ['10.0.0.1'];

        $this->assertSame('radar.fetch.private_address', $this->refusalOf('https://www.expat-dakar.com/a'));
        $this->dns['www.expat-dakar.com'] = [self::PUBLIC_IP];
        Http::fake([
            '*/robots.txt' => Http::response('', 404),
            '*' => $this->html(),
        ]);

        $this->assertSame(200, $this->fetcher()->fetch('https://www.expat-dakar.com/a')->status);
    }

    // ── fetchImage (TCK-2387) : une photo source, par le MÊME chemin protégé ─────────────────

    /** Une PNG de 2 × 3 pixels. */
    private static function png(): string
    {
        $image = imagecreatetruecolor(2, 3);
        ob_start();
        imagepng($image);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    private function image(string $bytes, string $type = 'image/png'): PromiseInterface
    {
        return Http::response($bytes, 200, ['Content-Type' => $type]);
    }

    private function imageRefusalOf(string $url): string
    {
        try {
            $this->fetcher()->fetchImage($url);
        } catch (RadarFetchRefused $e) {
            return $e->code;
        }

        $this->fail("L'image {$url} aurait dû être refusée.");
    }

    public function test_une_photo_servie_rend_son_type_ses_dimensions_et_ses_octets(): void
    {
        $png = self::png();
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => $this->image($png),
        ]);

        $image = $this->fetcher()->fetchImage('https://sn.coinafrique.com/photos/1.png');

        $this->assertInstanceOf(FetchedImage::class, $image);
        $this->assertSame('https://sn.coinafrique.com/photos/1.png', $image->url);
        $this->assertSame('image/png', $image->mime);
        $this->assertSame([2, 3], [$image->width, $image->height]);
        $this->assertSame($png, $image->bytes);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/photos/1.png') && $r->header('User-Agent') === [self::UA]);
    }

    public function test_un_octet_stream_generique_est_accepte_si_les_octets_sont_une_image(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1' => $this->image(self::png(), 'application/octet-stream'),
        ]);

        $this->assertSame('image/png', $this->fetcher()->fetchImage('https://sn.coinafrique.com/photos/1')->mime);
    }

    public function test_du_html_servi_en_image_png_n_est_pas_une_image(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => $this->image('<html><body>Pas une image</body></html>'),
        ]);

        $this->assertSame('radar.fetch.not_image', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
    }

    public function test_une_image_declaree_en_html_n_est_pas_une_image(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => $this->image(self::png(), 'text/html'),
        ]);

        $this->assertSame('radar.fetch.not_image', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
    }

    public function test_un_type_hors_de_la_liste_est_refuse(): void
    {
        config(['radar.photos.mimes' => ['image/jpeg']]);
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => $this->image(self::png()),
        ]);

        $this->assertSame('radar.fetch.not_image', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
    }

    public function test_une_erreur_http_sur_la_photo_est_refusee(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => Http::response('', 404),
        ]);

        $this->assertSame('radar.fetch.http_error', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
    }

    public function test_une_redirection_de_photo_vers_les_metadonnees_est_refusee_et_la_cible_jamais_contactee(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/piege.png' => Http::response('', 302, ['Location' => 'http://169.254.169.254/latest/meta-data/']),
            '169.254.169.254/*' => $this->image(self::png()),
        ]);

        $this->assertSame('radar.fetch.private_address', $this->imageRefusalOf('https://sn.coinafrique.com/photos/piege.png'));

        Http::assertNotSent(fn (Request $r) => parse_url($r->url(), PHP_URL_HOST) === '169.254.169.254');
    }

    public function test_une_photo_d_une_adresse_privee_est_refusee_sans_rien_contacter(): void
    {
        Http::fake();

        $this->assertSame('radar.fetch.private_address', $this->imageRefusalOf('http://127.0.0.1/photo.png'));

        Http::assertNothingSent();
    }

    public function test_un_robots_txt_qui_interdit_le_chemin_de_la_photo_la_refuse(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response("User-agent: *\nDisallow: /photos/\n", 200, ['Content-Type' => 'text/plain']),
            'https://sn.coinafrique.com/photos/*' => $this->image(self::png()),
        ]);

        $this->assertSame('radar.fetch.robots', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/photos/'));
    }

    public function test_une_photo_annoncee_plus_grosse_que_la_borne_des_photos_est_refusee(): void
    {
        config(['radar.photos.max_bytes' => 1000, 'radar.fetch.max_bytes' => 5_000_000]);
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => Http::response(self::png(), 200, ['Content-Type' => 'image/png', 'Content-Length' => '999999']),
        ]);

        $this->assertSame('radar.fetch.too_large', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
    }

    public function test_une_photo_lue_plus_grosse_que_la_borne_est_refusee_meme_sans_content_length(): void
    {
        config(['radar.photos.max_bytes' => 10]);
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => $this->image(self::png()),
        ]);

        $this->assertSame('radar.fetch.too_large', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
    }

    public function test_la_borne_des_pages_ne_borne_pas_les_photos(): void
    {
        // Une page de 100 octets au plus, une photo de 5 Mo au plus : chacune sa borne.
        config(['radar.fetch.max_bytes' => 100, 'radar.photos.max_bytes' => 5_000_000]);
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/1.png' => $this->image(self::png().str_repeat("\0", 500)),
        ]);

        $this->assertSame(2, $this->fetcher()->fetchImage('https://sn.coinafrique.com/photos/1.png')->width);
    }

    public function test_le_creneau_du_domaine_pris_differe_la_photo(): void
    {
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => Http::response('', 404),
            'https://sn.coinafrique.com/photos/*' => $this->image(self::png()),
        ]);
        $this->fetcher()->fetchImage('https://sn.coinafrique.com/photos/1.png');

        try {
            $this->fetcher()->fetchImage('https://sn.coinafrique.com/photos/2.png');
            $this->fail('La seconde photo aurait dû être différée.');
        } catch (RadarFetchDeferred $e) {
            $this->assertGreaterThanOrEqual(1, $e->retryAfterSeconds);
        }
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/photos/2.png'));
    }

    public function test_la_photo_a_le_meme_delai_total_que_la_page(): void
    {
        config(['radar.fetch.total_timeout_seconds' => 1]);
        Http::fake([
            'https://sn.coinafrique.com/robots.txt' => function () {
                $this->travel(3)->seconds();

                return Http::response('', 404);
            },
            'https://sn.coinafrique.com/photos/1.png' => $this->image(self::png()),
        ]);

        $this->assertSame('radar.fetch.timeout', $this->imageRefusalOf('https://sn.coinafrique.com/photos/1.png'));
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/photos/1.png'));
    }
}
