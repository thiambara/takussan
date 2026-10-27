<?php

namespace App\Services\Radar;

/**
 * TCK-2386 (ADR-0077 §10) — la résolution réelle : enregistrements A et AAAA, CNAME suivis par le
 * résolveur système.
 *
 * A et AAAA sont demandés SÉPARÉMENT : `dns_get_record($host, DNS_A | DNS_AAAA)` rend `false` dès
 * qu'une des deux questions échoue, et les adresses de l'autre se perdraient — y compris celles
 * qu'il fallait contrôler.
 */
class DnsHostResolver implements HostResolver
{
    public function resolve(string $host): array
    {
        $ips = [];
        foreach ([DNS_A => 'ip', DNS_AAAA => 'ipv6'] as $type => $field) {
            $records = $this->query($host, $type);

            foreach (is_array($records) ? $records : [] as $record) {
                $ip = $record[$field] ?? null;
                if (is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP) !== false) {
                    $ips[] = $ip;
                }
            }
        }

        return array_values(array_unique($ips));
    }

    /**
     * Une question DNS. `dns_get_record()` émet un avertissement sur un nom qui ne résout pas :
     * c'est un cas nominal ici (`radar.fetch.unresolvable`), pas une erreur à remonter.
     *
     * @return list<array<string, mixed>>|false
     */
    protected function query(string $host, int $type): array|false
    {
        return @dns_get_record($host, $type);
    }
}
