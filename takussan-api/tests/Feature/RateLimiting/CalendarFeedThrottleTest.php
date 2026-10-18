<?php

namespace Tests\Feature\RateLimiting;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-852 (P37.02) — les flux iCal (`ical-export`, le calendrier d'un bien) et d'agenda
 * (`calendar-feed`) sont relus par Airbnb, Booking.com et Google Agenda depuis des machines
 * communes. Bornés par IP seule, le 31ᵉ flux relu dans la minute par une même plateforme recevait
 * 429. Décision du porteur : 30 par minute et par flux (clé par jeton haché), plus une borne de
 * 600 par minute et par IP.
 */
class CalendarFeedThrottleTest extends ApiTestCase
{
    use RefreshDatabase;

    public static function flux(): array
    {
        return [
            'ical-export' => ['ical-export', fn () => '/ical/'.bin2hex(random_bytes(32)).'.ics'],
            'calendar-feed' => ['calendar-feed', fn () => '/api/calendar-feed/'.Str::random(40).'.ics'],
        ];
    }

    #[DataProvider('flux')]
    public function test_trente_et_un_flux_distincts_depuis_une_ip_restent_servis(string $limiteur, \Closure $url): void
    {
        foreach (range(1, 31) as $_) {
            $this->assertNotSame(429, $this->get($url())->status());
        }
    }

    #[DataProvider('flux')]
    public function test_le_trente_et_unieme_appel_d_un_meme_flux_recoit_429(string $limiteur, \Closure $url): void
    {
        $un = $url();
        foreach (range(1, 30) as $_) {
            $this->assertNotSame(429, $this->get($un)->status());
        }

        $this->get($un)->assertStatus(429);
    }

    #[DataProvider('flux')]
    public function test_deux_bornes_trente_par_flux_et_six_cents_par_ip(string $limiteur, \Closure $url): void
    {
        $limites = fn (string $chemin, string $ip): array => RateLimiter::limiter($limiteur)(
            $this->requeteRoutee($chemin, $ip),
        );

        $chemin = $url();
        [$parFlux, $parIp] = $limites($chemin, '203.0.113.7');
        $this->assertInstanceOf(Limit::class, $parFlux);
        $this->assertSame(30, $parFlux->maxAttempts);
        $this->assertSame(60, $parFlux->decaySeconds);
        $this->assertSame(600, $parIp->maxAttempts);
        $this->assertSame(60, $parIp->decaySeconds);

        // La clé par flux ne porte pas le jeton en clair, et ne dépend pas de l'IP.
        $jeton = Str::before(Str::afterLast($chemin, '/'), '.ics');
        $this->assertStringNotContainsString($jeton, (string) $parFlux->key);
        $this->assertSame($parFlux->key, $limites($chemin, '198.51.100.1')[0]->key);
        $this->assertNotSame($parFlux->key, $limites($url(), '203.0.113.7')[0]->key);
        // La clé par IP est celle de tous les limiteurs (TCK-851) : le /64 d'une IPv6.
        $this->assertSame($limites($chemin, '2001:db8:1:2::1')[1]->key, $limites($url(), '2001:db8:1:2::9')[1]->key);
    }

    private function requeteRoutee(string $chemin, string $ip): Request
    {
        $requete = Request::create($chemin, 'GET', server: ['REMOTE_ADDR' => $ip]);
        $route = app('router')->getRoutes()->match($requete);
        $requete->setRouteResolver(fn (): Route => $route);

        return $requete;
    }
}
