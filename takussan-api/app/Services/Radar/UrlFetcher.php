<?php

namespace App\Services\Radar;

use App\Services\Radar\Exceptions\RadarFetchDeferred;
use App\Services\Radar\Exceptions\RadarFetchRefused;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Exception\TransferException;
use GuzzleHttp\Psr7\Exception\MalformedUriException;
use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use InvalidArgumentException;

/**
 * TCK-2386 (ADR-0077 §10) — lire une URL tierce sans s'exposer.
 *
 * **Protégée (SSRF).** Chaque saut — l'URL de départ, chaque `Location`, et ceux du `robots.txt` —
 * passe par `target()` : schéma http/https, port 80/443, pas d'identifiants, Airbnb et `localhost`
 * refusés sans résolution, puis TOUTES les adresses du nom contrôlées (une seule privée ou réservée
 * suffit à refuser). La connexion est ensuite **épinglée** sur ces adresses (`CURLOPT_RESOLVE`) :
 * cURL ne résout pas une seconde fois, un DNS qui change de réponse entre le contrôle et la
 * connexion (rebinding) ne mène nulle part. Les redirections sont suivies à la main, jamais par le
 * client. Aucun mandataire (`proxy => ''`) : il résoudrait le nom lui-même.
 *
 * **Polie.** `robots.txt` respecté (interdit → `robots` ; absent → tout permis ; 5xx ou
 * injoignable → `robots_unavailable` ; saut refusé → le code de ce saut), User-Agent qui se nomme,
 * une lecture à la fois par domaine et un délai minimal entre deux (`RadarFetchDeferred`).
 *
 * **Bornée.** Délais courts, au plus `max_redirects` redirections, corps borné à `max_bytes`
 * (en-tête `Content-Length`, octets reçus au fil de l'eau par `BoundedSink`, puis taille lue).
 */
final class UrlFetcher
{
    /**
     * Plages refusées : boucle locale, privées, métadonnées, CGNAT, réservées, multicast, IPv4 mappée
     * — et les préfixes de TRANSITION IPv6 qui embarquent une IPv4 (6to4 `2002::/16` et son relais
     * `192.88.99.0/24`, Teredo `2001::/32`, NAT64 `64:ff9b::/96` et local `64:ff9b:1::/48`) :
     * `2002:7f00:1::1` mène à 127.0.0.1 par un relais. Refusés en bloc, plutôt que d'extraire et de
     * contrôler l'IPv4 embarquée : aucune annonce ne se sert depuis l'un d'eux.
     */
    private const BLOCKED_RANGES = [
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
        '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15',
        '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/3',
        '::/128', '::1/128', '::ffff:0:0/96', '::/96', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64',
        '2001::/32', '2001:10::/28', '2001:20::/28', '2001:db8::/32', '2002::/16', '3fff::/20',
        '5f00::/8', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8',
    ];

    private const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

    public function __construct(private readonly HostResolver $resolver) {}

    /**
     * Airbnb est hors périmètre (ADR-0077 §10) : `airbnb.<tld>` (y compris `airbnb.co.uk`) et ses
     * sous-domaines, `abnb.me` et ses sous-domaines. Un nom d'hôte, jamais un suffixe de texte :
     * `notairbnb.com` passe. Public : la validation de la saisie le réemploie.
     */
    public static function isAirbnb(string $host): bool
    {
        $host = rtrim(strtolower(trim($host)), '.');

        return $host === 'abnb.me'
            || str_ends_with($host, '.abnb.me')
            || preg_match('/(^|\.)airbnb\.[a-z]{2,}(\.[a-z]{2,})?$/', $host) === 1;
    }

    /** Une adresse IP est-elle joignable sans risque : ni privée, ni réservée, ni de boucle locale ? */
    public static function isPublicIp(string $ip): bool
    {
        $binary = @inet_pton($ip);
        if ($binary === false) {
            return false;
        }

        foreach (self::BLOCKED_RANGES as $range) {
            if (self::inRange($binary, $range)) {
                return false;
            }
        }

        // Ceinture et bretelles : les plages que PHP connaît, s'il en connaît une de plus.
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }

    /**
     * @throws RadarFetchRefused
     * @throws RadarFetchDeferred
     */
    public function fetch(string $url): FetchedPage
    {
        // Tout ce qui se refuse sans contacter personne se refuse AVANT de prendre le créneau du
        // domaine : une URL refusée ne retarde pas la lecture suivante.
        $target = $this->target($url);

        /** @var list<string> $held */
        $held = [];
        try {
            $this->hold($target['host'], $held);
            $redirects = 0;

            while (true) {
                if (! $this->robotsAllow($target, $held)) {
                    throw new RadarFetchRefused(RadarFetchRefused::ROBOTS);
                }

                $response = $this->send($target);
                $location = $this->redirectLocation($response);
                if ($location === null) {
                    break;
                }

                if (++$redirects > (int) config('radar.fetch.max_redirects', 3)) {
                    throw new RadarFetchRefused(RadarFetchRefused::TOO_MANY_REDIRECTS);
                }

                $target = $this->target($this->resolveLocation($target['url'], $location));
                $this->hold($target['host'], $held);
            }
        } finally {
            $this->release($held);
        }

        if (! $response->successful()) {
            throw new RadarFetchRefused(RadarFetchRefused::HTTP_ERROR);
        }

        $body = $response->body();
        $contentType = $response->header('Content-Type');
        $contentType = $contentType === '' ? null : $contentType;

        if (! $this->isHtml($contentType, $body)) {
            throw new RadarFetchRefused(RadarFetchRefused::NOT_HTML);
        }

        return new FetchedPage($target['url'], $response->status(), $body, $contentType);
    }

    /**
     * Les options Guzzle d'une requête vers `$host:$port`, épinglée sur les adresses contrôlées.
     * Publique pour être éprouvée : `Http::fake()` n'exécute pas cURL, il ne peut pas prouver
     * l'épinglage.
     *
     * @param  list<string>  $ips
     * @return array<string, mixed>
     */
    public function requestOptions(string $host, int $port, array $ips): array
    {
        $addresses = implode(',', array_map(
            fn (string $ip) => str_contains($ip, ':') ? "[{$ip}]" : $ip,
            $ips,
        ));

        return [
            'allow_redirects' => false,
            'proxy' => '',
            'timeout' => (int) config('radar.fetch.timeout_seconds', 10),
            'connect_timeout' => (int) config('radar.fetch.connect_timeout_seconds', 5),
            'curl' => [CURLOPT_RESOLVE => ["{$host}:{$port}:{$addresses}"]],
        ];
    }

    /**
     * Contrôle un saut et rend de quoi s'y connecter. L'URL est analysée par le même analyseur que
     * celui du client HTTP (`GuzzleHttp\Psr7\Uri`), et c'est sa forme resérialisée qui est demandée :
     * l'hôte contrôlé est celui que le client contactera.
     *
     * @return array{url: string, scheme: string, host: string, port: int, pathQuery: string, ips: list<string>}
     */
    private function target(string $url): array
    {
        // Un antislash, un blanc ou un caractère de contrôle sont les points où deux analyseurs
        // d'URL (le nôtre, celui de cURL) divergent : refusés d'emblée.
        if ($url === '' || preg_match('/[\\\\\s\x00-\x1F\x7F]/', $url) === 1) {
            throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
        }

        try {
            $uri = (new Uri($url))->withFragment('');
        } catch (MalformedUriException|InvalidArgumentException) {
            throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
        }

        $scheme = strtolower($uri->getScheme());
        $host = rtrim(strtolower($uri->getHost()), '.');

        if (! in_array($scheme, ['http', 'https'], true) || $host === '' || $uri->getUserInfo() !== '') {
            throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
        }

        $port = $uri->getPort() ?? ($scheme === 'https' ? 443 : 80);
        if (! in_array($port, [80, 443], true)) {
            throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
        }

        $literal = $this->ipLiteral($host);

        if ($literal === null) {
            $host = $this->asciiHost($host);
            // Une seconde fois sur la forme ASCII : `１２７.０.０.１` et `127。0。0。1` ne sont un
            // littéral qu'APRÈS la conversion IDN, et partiraient sinon au résolveur comme un nom.
            $literal = $this->ipLiteral($host);
        }

        if ($literal === null) {
            if (self::isAirbnb($host)) {
                throw new RadarFetchRefused(RadarFetchRefused::AIRBNB);
            }

            if ($host === 'localhost' || str_ends_with($host, '.localhost')) {
                throw new RadarFetchRefused(RadarFetchRefused::PRIVATE_ADDRESS);
            }

            $ips = $this->resolver->resolve($host);
            if ($ips === []) {
                throw new RadarFetchRefused(RadarFetchRefused::UNRESOLVABLE);
            }
        } else {
            $ips = [$literal];
        }

        foreach ($ips as $ip) {
            if (! self::isPublicIp($ip)) {
                throw new RadarFetchRefused(RadarFetchRefused::PRIVATE_ADDRESS);
            }
        }

        $uri = $uri->withScheme($scheme)->withHost($host);
        $path = $uri->getPath() ?: '/';
        $uri = $uri->withPath($path);

        return [
            'url' => (string) $uri,
            'scheme' => $scheme,
            'host' => $host,
            'port' => $port,
            'pathQuery' => $path.($uri->getQuery() !== '' ? '?'.$uri->getQuery() : ''),
            'ips' => array_values($ips),
        ];
    }

    /**
     * L'adresse d'un hôte littéral IP, ou null pour un nom. Une forme d'IPv4 non canonique —
     * décimale (`2130706433`), hexadécimale (`0x7f.1`), octale (`0177.0.0.1`) — est refusée : cURL
     * la lirait comme une adresse, et elle échapperait au contrôle. Un nom de domaine n'a jamais un
     * dernier label tout numérique.
     */
    private function ipLiteral(string $host): ?string
    {
        if (str_starts_with($host, '[') && str_ends_with($host, ']')) {
            $ip = substr($host, 1, -1);
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false) {
                throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
            }

            return $ip;
        }

        $labels = explode('.', $host);
        $last = end($labels);
        if (preg_match('/^(\d+|0x[0-9a-f]*)$/i', (string) $last) === 1) {
            if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
                throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
            }

            return $host;
        }

        return null;
    }

    private function asciiHost(string $host): string
    {
        if (preg_match('/^[a-z0-9._-]+$/', $host) === 1) {
            return $host;
        }

        $ascii = function_exists('idn_to_ascii')
            ? idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46)
            : false;

        if (! is_string($ascii) || preg_match('/^[a-z0-9._-]+$/', $ascii = strtolower($ascii)) !== 1) {
            throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
        }

        return $ascii;
    }

    /**
     * Le créneau du domaine : une lecture à la fois, et `min_delay_seconds` entre deux. Le verrou
     * est pris pour la durée la plus longue qu'une lecture puisse tenir, puis ramené au délai
     * minimal compté depuis la fin de la lecture (`release()`, dans un `finally`).
     *
     * Le pire cas : (R + 1) sauts de page, chacun pouvant lire le `robots.txt` d'une nouvelle
     * origine en (R + 1) requêtes, soit (R + 1)(R + 2) requêtes, chacune bornée par le délai
     * d'expiration — compté avec celui de connexion pour couvrir aussi les résolutions DNS, que
     * cURL ne fait pas (elles sont faites avant, par `HostResolver`). 305 s avec R = 3.
     *
     * @param  list<string>  $held
     */
    private function hold(string $host, array &$held): void
    {
        if (in_array($host, $held, true)) {
            return;
        }

        $delay = max(1, (int) config('radar.fetch.min_delay_seconds', 5));
        $redirects = (int) config('radar.fetch.max_redirects', 3);
        $inFlight = $delay + ($redirects + 1) * ($redirects + 2)
            * ((int) config('radar.fetch.timeout_seconds', 10) + (int) config('radar.fetch.connect_timeout_seconds', 5));

        $now = now()->getTimestamp();
        if (! Cache::add($this->slotKey($host), $now + $inFlight, $inFlight)) {
            $until = Cache::get($this->slotKey($host));
            $until = is_int($until) ? $until : $now + $delay;

            throw new RadarFetchDeferred(max(1, $until - $now));
        }

        $held[] = $host;
    }

    /** @param list<string> $held */
    private function release(array $held): void
    {
        $delay = max(1, (int) config('radar.fetch.min_delay_seconds', 5));
        foreach ($held as $host) {
            Cache::put($this->slotKey($host), now()->getTimestamp() + $delay, $delay);
        }
    }

    private function slotKey(string $host): string
    {
        return 'radar:fetch:'.$host;
    }

    /**
     * Le `robots.txt` de l'origine du saut, en cache `robots_cache_seconds`. Seuls un fichier lu et
     * un fichier absent (4xx) se gardent en cache : un refus faute de réponse (5xx, délai, adresse
     * refusée) se relit à la lecture suivante — une panne passagère ne ferme pas un domaine un jour.
     *
     * @param  array{url: string, scheme: string, host: string, port: int, pathQuery: string, ips: list<string>}  $target
     * @param  list<string>  $held
     */
    private function robotsAllow(array $target, array &$held): bool
    {
        $key = 'radar:robots:'.$target['scheme'].'://'.$target['host'].':'.$target['port'];
        $robots = Cache::get($key);

        if (! is_string($robots)) {
            $robots = $this->readRobots($target, $held);
            Cache::put($key, $robots, (int) config('radar.fetch.robots_cache_seconds', 86_400));
        }

        return RobotsTxt::allows($robots, $target['pathQuery'], (string) config('radar.fetch.user_agent'));
    }

    /**
     * Le texte du `robots.txt`, '' s'il est absent (4xx). Lu par le même chemin protégé que la page :
     * chaque redirection est un saut contrôlé, et une redirection vers un autre hôte prend le
     * créneau de cet hôte (Google suit ces redirections ; `coinafrique.com` → `www.…` est courant).
     *
     * Un saut refusé propage son propre code (`private_address`, `too_many_redirects`…) ; un fichier
     * qu'on n'a pas pu lire (5xx, délai, connexion) lève `robots_unavailable`, distinct de
     * `robots` (le fichier interdit la page).
     *
     * @param  array{url: string, scheme: string, host: string, port: int, pathQuery: string, ips: list<string>}  $target
     * @param  list<string>  $held
     *
     * @throws RadarFetchRefused
     */
    private function readRobots(array $target, array &$held): string
    {
        $hop = ['url' => (string) (new Uri($target['url']))->withPath('/robots.txt')->withQuery(''), 'pathQuery' => '/robots.txt'] + $target;

        try {
            $redirects = 0;
            while (($location = $this->redirectLocation($response = $this->send($hop))) !== null) {
                if (++$redirects > (int) config('radar.fetch.max_redirects', 3)) {
                    throw new RadarFetchRefused(RadarFetchRefused::TOO_MANY_REDIRECTS);
                }
                $hop = $this->target($this->resolveLocation($hop['url'], $location));
                $this->hold($hop['host'], $held);
            }
        } catch (RadarFetchRefused $e) {
            throw in_array($e->code, [RadarFetchRefused::TIMEOUT, RadarFetchRefused::HTTP_ERROR], true)
                ? new RadarFetchRefused(RadarFetchRefused::ROBOTS_UNAVAILABLE)
                : $e;
        }

        if ($response->successful()) {
            return $response->body();
        }

        if ($response->clientError()) {
            return '';
        }

        throw new RadarFetchRefused(RadarFetchRefused::ROBOTS_UNAVAILABLE);
    }

    /**
     * Une requête, épinglée, sans redirection, corps borné.
     *
     * @param  array{url: string, scheme: string, host: string, port: int, pathQuery: string, ips: list<string>}  $target
     */
    private function send(array $target): Response
    {
        $maxBytes = (int) config('radar.fetch.max_bytes', 2_000_000);
        $sink = new BoundedSink($maxBytes);

        try {
            $response = Http::withOptions($this->requestOptions($target['host'], $target['port'], $target['ips']) + ['sink' => $sink])
                ->withUserAgent((string) config('radar.fetch.user_agent'))
                ->get($target['url']);
        } catch (ConnectionException|TransferException $e) {
            if ($sink->exceeded) {
                throw new RadarFetchRefused(RadarFetchRefused::TOO_LARGE);
            }

            throw new RadarFetchRefused($this->timedOut($e) ? RadarFetchRefused::TIMEOUT : RadarFetchRefused::HTTP_ERROR);
        }

        $length = $response->header('Content-Length');
        if ($sink->exceeded
            || (ctype_digit($length) && (int) $length > $maxBytes)
            || strlen($response->body()) > $maxBytes) {
            throw new RadarFetchRefused(RadarFetchRefused::TOO_LARGE);
        }

        return $response;
    }

    /**
     * Le délai est-il dépassé ? Le code cURL du contexte du gestionnaire (`errno` 28) d'abord — la
     * `ConnectionException` de Laravel garde l'exception Guzzle en `previous` ; le texte du message
     * seulement à défaut.
     */
    private function timedOut(\Throwable $e): bool
    {
        for ($cause = $e; $cause !== null; $cause = $cause->getPrevious()) {
            if ($cause instanceof ConnectException || $cause instanceof RequestException) {
                $errno = $cause->getHandlerContext()['errno'] ?? null;
                if (is_int($errno)) {
                    return $errno === CURLE_OPERATION_TIMEDOUT;
                }
            }
        }

        return str_contains($e->getMessage(), 'cURL error 28') || stripos($e->getMessage(), 'timed out') !== false;
    }

    private function redirectLocation(Response $response): ?string
    {
        if (! in_array($response->status(), self::REDIRECT_STATUSES, true)) {
            return null;
        }

        $location = trim($response->header('Location'));

        return $location === '' ? null : $location;
    }

    private function resolveLocation(string $base, string $location): string
    {
        try {
            return (string) UriResolver::resolve(new Uri($base), new Uri($location));
        } catch (MalformedUriException|InvalidArgumentException) {
            throw new RadarFetchRefused(RadarFetchRefused::INVALID_URL);
        }
    }

    /**
     * `text/html` ou `application/xhtml+xml`. Sans `Content-Type`, le corps doit s'ouvrir comme du
     * HTML (`<!doctype html`, `<html`) : accepter en aveugle laisserait passer une image ou un
     * binaire jusqu'à l'extraction.
     */
    private function isHtml(?string $contentType, string $body): bool
    {
        if ($contentType !== null) {
            $mime = strtolower(trim(explode(';', $contentType, 2)[0]));

            return in_array($mime, ['text/html', 'application/xhtml+xml'], true);
        }

        $head = ltrim(substr(preg_replace('/^\xEF\xBB\xBF/', '', $body) ?? $body, 0, 1024));

        return preg_match('/^(<!--.*?-->\s*)*<(!doctype\s+html|html[\s>])/is', $head) === 1;
    }

    private static function inRange(string $binary, string $cidr): bool
    {
        [$network, $bits] = explode('/', $cidr);
        $networkBinary = inet_pton($network);

        if ($networkBinary === false || strlen($networkBinary) !== strlen($binary)) {
            return false;
        }

        $bits = (int) $bits;
        $bytes = intdiv($bits, 8);
        if (substr($binary, 0, $bytes) !== substr($networkBinary, 0, $bytes)) {
            return false;
        }

        $remainder = $bits % 8;
        if ($remainder === 0) {
            return true;
        }

        $mask = (0xFF << (8 - $remainder)) & 0xFF;

        return (ord($binary[$bytes]) & $mask) === (ord($networkBinary[$bytes]) & $mask);
    }
}
