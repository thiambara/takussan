<?php

namespace App\Services\Radar;

/** TCK-2386 (ADR-0077 §10) — la résolution réelle : enregistrements A et AAAA, CNAME suivis par le résolveur système. */
final class DnsHostResolver implements HostResolver
{
    public function resolve(string $host): array
    {
        // `dns_get_record()` émet un avertissement sur un nom qui ne résout pas : c'est un cas
        // nominal ici (`radar.fetch.unresolvable`), pas une erreur à remonter.
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);

        if (! is_array($records)) {
            return [];
        }

        $ips = [];
        foreach ($records as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;
            if (is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP) !== false) {
                $ips[] = $ip;
            }
        }

        return array_values(array_unique($ips));
    }
}
