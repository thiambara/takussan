<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\DnsHostResolver;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2386 (ADR-0077 §10) — A et AAAA sont demandés séparément : `dns_get_record(DNS_A | DNS_AAAA)`
 * rend `false` dès qu'une des deux questions échoue, et l'autre moitié des adresses se perdrait.
 * La question DNS elle-même est doublée : aucun test ne touche le réseau.
 */
class DnsHostResolverTest extends TestCase
{
    /** @param array<int, list<array<string, string>>|false> $answers */
    private function resolver(array $answers): DnsHostResolver
    {
        return new class($answers) extends DnsHostResolver
        {
            /** @param array<int, list<array<string, string>>|false> $answers */
            public function __construct(private array $answers) {}

            protected function query(string $host, int $type): array|false
            {
                return $this->answers[$type];
            }
        };
    }

    public function test_a_et_aaaa_sont_fusionnes(): void
    {
        $ips = $this->resolver([
            DNS_A => [['ip' => '93.184.216.34']],
            DNS_AAAA => [['ipv6' => '2606:2800:220:1::1']],
        ])->resolve('x.example');

        $this->assertSame(['93.184.216.34', '2606:2800:220:1::1'], $ips);
    }

    public function test_un_echec_de_a_garde_les_adresses_aaaa(): void
    {
        $ips = $this->resolver([DNS_A => false, DNS_AAAA => [['ipv6' => 'fc00::1']]])->resolve('x.example');

        $this->assertSame(['fc00::1'], $ips);
    }

    public function test_un_echec_de_aaaa_garde_les_adresses_a(): void
    {
        $ips = $this->resolver([DNS_A => [['ip' => '10.0.0.1']], DNS_AAAA => false])->resolve('x.example');

        $this->assertSame(['10.0.0.1'], $ips);
    }

    public function test_deux_echecs_rendent_une_liste_vide(): void
    {
        $this->assertSame([], $this->resolver([DNS_A => false, DNS_AAAA => false])->resolve('x.example'));
    }

    public function test_les_valeurs_qui_ne_sont_pas_des_adresses_sont_ignorees_et_les_doublons_retires(): void
    {
        $ips = $this->resolver([
            DNS_A => [['ip' => '93.184.216.34'], ['ip' => '93.184.216.34'], ['host' => 'x'], ['ip' => 'pas une ip']],
            DNS_AAAA => [],
        ])->resolve('x.example');

        $this->assertSame(['93.184.216.34'], $ips);
    }
}
