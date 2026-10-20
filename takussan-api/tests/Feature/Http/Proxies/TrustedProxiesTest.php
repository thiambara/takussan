<?php

namespace Tests\Feature\Http\Proxies;

use App\Http\Middleware\RestrictIpMiddleware;
use App\Services\Admin\HealthcheckService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-853 (P37.06) — la confiance accordée aux mandataires :
 *
 *   · d'un mandataire de confiance, Laravel ne croit que `X-Forwarded-For`, `-Proto` et `-Port`.
 *     L'hôte et le préfixe ne viennent pas d'un en-tête : les URL rendues par l'API (`url()`,
 *     routes signées) portent l'origine d'`APP_URL` (TCK-1058, `RacineDesUrlTest`) ;
 *   · la liste d'IP des webhooks compare par `IpUtils::checkIp` : plages CIDR et IPv6 sous
 *     n'importe quelle écriture ;
 *   · `TRUSTED_PROXIES=*` ne croit personne (le découpage en fait `['*']`, que `TrustProxies` ne
 *     reconnaît pas) : rien ne le refuse au démarrage, mais la sonde de santé le dit `degraded` et
 *     le journal le crie.
 */
class TrustedProxiesTest extends TestCase
{
    use RefreshDatabase;

    private ?string $trustedProxiesAvant = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->trustedProxiesAvant = $_SERVER['TRUSTED_PROXIES'] ?? null;
    }

    protected function tearDown(): void
    {
        if ($this->trustedProxiesAvant === null) {
            unset($_SERVER['TRUSTED_PROXIES']);
        } else {
            $_SERVER['TRUSTED_PROXIES'] = $this->trustedProxiesAvant;
        }
        parent::tearDown();
    }

    public function test_d_un_mandataire_de_confiance_l_hote_et_le_prefixe_ne_sont_pas_crus(): void
    {
        Route::get('/_test/mandataire', fn (Request $request) => [
            'ip' => $request->ip(),
            'scheme' => $request->getScheme(),
            'port' => $request->getPort(),
            'host' => $request->getHost(),
            'url' => url('/chemin'),
        ]);

        $reponse = $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
            ->withHeaders([
                'X-Forwarded-For' => '203.0.113.9',
                'X-Forwarded-Proto' => 'https',
                'X-Forwarded-Port' => '8443',
                'X-Forwarded-Host' => 'piege.example',
                'X-Forwarded-Prefix' => '/piege',
            ])
            ->getJson('/_test/mandataire')
            ->assertOk();

        $this->assertSame('203.0.113.9', $reponse->json('ip'), 'le mandataire est bien de confiance');
        $this->assertSame('https', $reponse->json('scheme'));
        $this->assertSame(8443, $reponse->json('port'));
        $this->assertNotSame('piege.example', $reponse->json('host'));
        $this->assertStringNotContainsString('piege', (string) $reponse->json('url'));
    }

    public function test_la_liste_d_ip_des_webhooks_accepte_plages_et_ipv6_sous_toute_ecriture(): void
    {
        config(['sms.webhook_allowed_ips.essai' => ['203.0.113.0/24', '2001:db8::1']]);

        $this->assertTrue($this->passe('203.0.113.50'));
        $this->assertTrue($this->passe('2001:0db8:0000::0001'));
        $this->assertFalse($this->passe('198.51.100.1'));
        $this->assertFalse($this->passe('2001:db8::2'));
    }

    public function test_un_joker_dans_trusted_proxies_degrade_la_sonde_et_crie_au_journal(): void
    {
        $this->sondesNeutres();
        Log::spy();
        $_SERVER['TRUSTED_PROXIES'] = '10.0.1.0/24,*';

        $sonde = app(HealthcheckService::class)->refresh()['proxies'];

        $this->assertSame('degraded', $sonde['status']);
        $this->assertSame('wildcard_trusts_nobody', $sonde['reason']);
        Log::shouldHaveReceived('critical')->withArgs(fn (string $message) => str_contains($message, 'TRUSTED_PROXIES'));
    }

    public function test_une_liste_explicite_laisse_la_sonde_ok(): void
    {
        $this->sondesNeutres();
        Log::spy();
        $_SERVER['TRUSTED_PROXIES'] = '10.0.1.0/24,173.245.48.0/20';

        $this->assertSame('ok', app(HealthcheckService::class)->refresh()['proxies']['status']);
        Log::shouldNotHaveReceived('critical');
    }

    private function sondesNeutres(): void
    {
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);
    }

    private function passe(string $ip): bool
    {
        $requete = Request::create('/webhook', 'POST', server: ['REMOTE_ADDR' => $ip]);

        try {
            (new RestrictIpMiddleware)->handle($requete, fn () => response('ok'), 'essai');

            return true;
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());

            return false;
        }
    }
}
