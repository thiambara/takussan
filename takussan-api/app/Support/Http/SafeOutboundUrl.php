<?php

namespace App\Support\Http;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Psr\Http\Message\ResponseInterface;
use Throwable;

/**
 * TCK-596 (ADR-0041 §7) — la garde de tout appel HTTP sortant vers une URL fournie par un
 * utilisateur (flux iCal importé). Sans elle, `http://169.254.169.254/` (métadonnées du VPS) ou
 * `http://127.0.0.1:6379/` deviennent atteignables depuis le serveur.
 *
 * - HTTPS seulement, port 443, sans identifiants dans l'URL ;
 * - l'hôte est résolu, et TOUTES ses adresses doivent être globales : privées, bouclage,
 *   lien-local, réservées, CGNAT, ULA et IPv4 mappées sont refusées ;
 * - la connexion est ÉPINGLÉE sur l'adresse vérifiée (`CURLOPT_RESOLVE`) : une seconde résolution
 *   ne peut pas rebondir vers une adresse interne (DNS rebinding) ;
 * - aucune redirection suivie, 10 s au plus, 1 Mo au plus (en-tête, flux et corps).
 *
 * Un refus d'adresse a lieu AVANT toute requête : {@see self::check()} n'émet rien.
 */
class SafeOutboundUrl
{
    public const TIMEOUT_SECONDS = 10;

    public const MAX_BYTES = 1_048_576;

    public function __construct(private readonly DnsResolver $dns) {}

    /**
     * @return array{host: string, ip: string}
     *
     * @throws UnsafeOutboundUrl
     */
    public function check(string $url): array
    {
        $parts = parse_url($url);
        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            throw new UnsafeOutboundUrl('invalid_url');
        }
        if (strtolower($parts['scheme']) !== 'https') {
            throw new UnsafeOutboundUrl('not_https');
        }
        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new UnsafeOutboundUrl('invalid_url');
        }
        if (isset($parts['port']) && (int) $parts['port'] !== 443) {
            throw new UnsafeOutboundUrl('port_not_allowed');
        }

        $host = strtolower(trim($parts['host'], '[]'));
        $ips = $this->dns->resolve($host);
        if ($ips === []) {
            throw new UnsafeOutboundUrl('unresolvable');
        }
        foreach ($ips as $ip) {
            if (! self::isPublicIp($ip)) {
                throw new UnsafeOutboundUrl('private_address');
            }
        }

        return ['host' => $host, 'ip' => $ips[0]];
    }

    /**
     * Le corps de la réponse, ou une exception au motif codé.
     *
     * @throws UnsafeOutboundUrl
     */
    public function get(string $url): string
    {
        ['host' => $host, 'ip' => $ip] = $this->check($url);

        $pin = str_contains($ip, ':') ? '['.$ip.']' : $ip;

        try {
            $response = Http::withOptions([
                'allow_redirects' => false,
                'curl' => [CURLOPT_RESOLVE => [$host.':443:'.$pin]],
                'on_headers' => static function (ResponseInterface $response): void {
                    $length = $response->getHeaderLine('Content-Length');
                    if ($length !== '' && (int) $length > self::MAX_BYTES) {
                        throw new UnsafeOutboundUrl('too_large');
                    }
                },
                'progress' => static function ($total, $downloaded): void {
                    if ($downloaded > self::MAX_BYTES) {
                        throw new UnsafeOutboundUrl('too_large');
                    }
                },
            ])
                ->timeout(self::TIMEOUT_SECONDS)
                ->connectTimeout(self::TIMEOUT_SECONDS)
                ->accept('text/calendar')
                ->get($url);
        } catch (UnsafeOutboundUrl $e) {
            throw $e;
        } catch (ConnectionException) {
            throw new UnsafeOutboundUrl('unreachable');
        } catch (Throwable $e) {
            $previous = $e->getPrevious();
            if ($previous instanceof UnsafeOutboundUrl) {
                throw $previous;
            }

            throw new UnsafeOutboundUrl('unreachable');
        }

        if ($response->redirect()) {
            throw new UnsafeOutboundUrl('redirect');
        }
        if (! $response->successful()) {
            throw new UnsafeOutboundUrl('http_error');
        }

        $body = $response->body();
        if (strlen($body) > self::MAX_BYTES) {
            throw new UnsafeOutboundUrl('too_large');
        }

        return $body;
    }

    public static function isPublicIp(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return false;
        }

        // Préfixes IPv6 qui TRANSPORTENT une adresse IPv4 vers un relais : NAT64 (`64:ff9b::/96`,
        // `64:ff9b:1::/48`) et 6to4 (`2002::/16`). `64:ff9b::a9fe:a9fe` atteint
        // `169.254.169.254` sur un réseau NAT64, et PHP la juge globale (mesuré).
        //
        // VERIF-596 m3 — deux plages que PHP juge globales aussi (mesuré) :
        // - `::/8` en entier (réservé par l'IETF, aucune adresse globale n'y vit), qui porte les
        //   IPv4 mappées (`::ffff:a.b.c.d`, déjà refusées par `NO_RES_RANGE`), traduites
        //   (`::ffff:0:a.b.c.d` : `::ffff:0:7f00:1` passait) et compatibles (`::a.b.c.d`) ;
        // - `fec0::/10`, le site-local déprécié, voisin de `fe80::/10` : on refuse `fe80::/9`.
        $packed = @inet_pton($ip);
        if ($packed !== false && strlen($packed) === 16) {
            $hex = bin2hex($packed);
            if (str_starts_with($hex, '0064ff9b') || str_starts_with($hex, '2002')) {
                return false;
            }
            if (str_starts_with($hex, '00')) {
                return false;
            }
            if (ord($packed[0]) === 0xFE && (ord($packed[1]) & 0x80) === 0x80) {
                return false;
            }
        }

        // Multidiffusion (224.0.0.0/4, ff00::/8) : `GLOBAL_RANGE` la laisse passer.
        if (preg_match('/^(22[4-9]|23\d)\./', $ip) === 1 || str_starts_with(strtolower($ip), 'ff')) {
            return false;
        }

        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE | FILTER_FLAG_GLOBAL_RANGE,
        ) !== false;
    }
}
