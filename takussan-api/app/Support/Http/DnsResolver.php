<?php

namespace App\Support\Http;

/**
 * TCK-596 (ADR-0041 §7) — résout un hôte en adresses IPv4 et IPv6. Une classe à part pour que les
 * tests de la garde SSRF substituent la résolution sans réseau.
 */
class DnsResolver
{
    /** @return list<string> */
    public function resolve(string $host): array
    {
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [$host];
        }

        $ips = gethostbynamel($host) ?: [];
        $records = @dns_get_record($host, DNS_AAAA) ?: [];
        foreach ($records as $record) {
            if (isset($record['ipv6'])) {
                $ips[] = $record['ipv6'];
            }
        }

        return array_values(array_unique($ips));
    }
}
