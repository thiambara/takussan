<?php

namespace Tests\Feature\RateLimiting;

use App\Models\Property;
use App\Services\Property\PropertyViewCounter;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-851 (P37.01) — une IPv6 désigne un visiteur par son /64 (`VisitorFingerprint::network`),
 * dans TOUT limiteur et tout compteur qui lit `$request->ip()`. Un abonné IPv6 dispose d'un /64
 * entier : clé sur l'adresse complète, chaque adresse neuve repartait avec un seau neuf.
 */
class IpRateLimitKeyTest extends ApiTestCase
{
    use RefreshDatabase;

    private const MEME_64_A = '2001:db8:1:2::1';

    private const MEME_64_B = '2001:db8:1:2:ffff:ffff:ffff:fffe';

    private const AUTRE_64 = '2001:db8:1:3::1';

    /** Chaque limiteur nommé qui, sans compte, se clé par l'IP de l'appelant. */
    public static function limiteurs(): array
    {
        return array_map(fn (string $nom) => [$nom], [
            'auth-register' => 'auth-register',
            'auth-password' => 'auth-password',
            'auth-phone-send' => 'auth-phone-send',
            'ical-export' => 'ical-export',
            'calendar-feed' => 'calendar-feed',
            'calendar-feed-create' => 'calendar-feed-create',
            'lease-signature-code' => 'lease-signature-code',
            'lease-signature' => 'lease-signature',
            'visit-planning' => 'visit-planning',
            'invitations-send' => 'invitations-send',
            'account-deletion-step-up' => 'account-deletion-step-up',
            'webhook-sms-orange' => 'webhook-sms-orange',
            'webhook-sms-mtarget' => 'webhook-sms-mtarget',
            'webhook-sms-lafricamobile' => 'webhook-sms-lafricamobile',
            'webhook-whatsapp' => 'webhook-whatsapp',
            'search-suggest' => 'search-suggest',
            'public-read' => 'public-read',
            'public-view' => 'public-view',
            'public-report' => 'public-report',
            'public-visit-request' => 'public-visit-request',
            'public-contact-lead' => 'public-contact-lead',
            'public-search-alert' => 'public-search-alert',
            'public-contact-click' => 'public-contact-click',
        ]);
    }

    /** @return list<string> */
    private function cles(string $limiteur, string $ip): array
    {
        $reponse = RateLimiter::limiter($limiteur)(Request::create('/x', 'POST', server: ['REMOTE_ADDR' => $ip]));

        return array_map(fn (Limit $limit) => (string) $limit->key, is_array($reponse) ? $reponse : [$reponse]);
    }

    #[DataProvider('limiteurs')]
    public function test_deux_adresses_du_meme_64_partagent_un_seau(string $limiteur): void
    {
        $this->assertSame($this->cles($limiteur, self::MEME_64_A), $this->cles($limiteur, self::MEME_64_B));
        $this->assertNotSame($this->cles($limiteur, self::MEME_64_A), $this->cles($limiteur, self::AUTRE_64));
    }

    /** Le modèle de la mesure : huit demandes de réinitialisation depuis huit adresses du même /64. */
    public function test_la_reinitialisation_borne_le_64_et_non_l_adresse(): void
    {
        $statuts = [];
        foreach (range(1, 6) as $i) {
            $statuts[] = $this->withServerVariables(['REMOTE_ADDR' => '2001:db8:1:2::'.$i])
                ->postJson('/api/auth/forgot-password', ['email' => "personne{$i}@example.test"])
                ->status();
        }

        $this->assertNotContains(429, array_slice($statuts, 0, 5));
        $this->assertSame(429, $statuts[5]);
    }

    /** Un débit numérique (`throttle:5,10` de `auth/login`) : `ThrottleRequests` signe l'IP. */
    public function test_un_debit_numerique_borne_le_64_et_non_l_adresse(): void
    {
        $statuts = [];
        foreach (range(1, 6) as $i) {
            $statuts[] = $this->withServerVariables(['REMOTE_ADDR' => '2001:db8:1:2::'.$i])
                ->postJson('/api/auth/login', ['email' => "inconnu{$i}@example.test", 'password' => 'faux-mot-de-passe'])
                ->status();
        }

        $this->assertNotContains(429, array_slice($statuts, 0, 5));
        $this->assertSame(429, $statuts[5]);

        // Un autre /64 garde son propre seau.
        $this->assertNotSame(429, $this->withServerVariables(['REMOTE_ADDR' => self::AUTRE_64])
            ->postJson('/api/auth/login', ['email' => 'autre@example.test', 'password' => 'faux-mot-de-passe'])
            ->status());
    }

    public function test_la_vue_d_un_bien_se_compte_par_64(): void
    {
        $property = Property::factory()->published()->create(['views_count' => 0]);
        $compteur = app(PropertyViewCounter::class);

        foreach (range(1, 5) as $i) {
            $compteur->record($property, '2001:db8:1:2::'.$i);
        }
        $compteur->record($property, self::AUTRE_64);

        $this->assertSame(4, (int) Property::query()->whereKey($property->id)->value('views_count'), 'trois pour le /64, une pour l’autre');
    }
}
