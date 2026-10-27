<?php

namespace App\Services\Radar\Exceptions;

use RuntimeException;

/**
 * TCK-2386 (ADR-0077 §10) — la lecture d'une URL est refusée, définitivement : la relancer rendrait
 * le même refus. `code` est un code `radar.fetch.*`, jamais de la prose : il devient le motif
 * d'état de l'annonce (`stage_reason`) et c'est le front qui le traduit.
 *
 * `$code` redéclaré public et en chaîne, comme le fait `PDOException` : `getCode()` le rend tel quel.
 */
final class RadarFetchRefused extends RuntimeException
{
    public const INVALID_URL = 'radar.fetch.invalid_url';

    public const AIRBNB = 'radar.fetch.airbnb';

    public const PRIVATE_ADDRESS = 'radar.fetch.private_address';

    /** Le `robots.txt` du domaine interdit la page. */
    public const ROBOTS = 'radar.fetch.robots';

    /** Le `robots.txt` n'a pas pu être lu (5xx, délai, connexion) : tout est refusé, sans cache. */
    public const ROBOTS_UNAVAILABLE = 'radar.fetch.robots_unavailable';

    public const TOO_MANY_REDIRECTS = 'radar.fetch.too_many_redirects';

    public const TOO_LARGE = 'radar.fetch.too_large';

    public const NOT_HTML = 'radar.fetch.not_html';

    /** TCK-2387 — une photo source dont les octets, relus, ne sont pas une image d'un type attendu. */
    public const NOT_IMAGE = 'radar.fetch.not_image';

    public const HTTP_ERROR = 'radar.fetch.http_error';

    public const TIMEOUT = 'radar.fetch.timeout';

    public const UNRESOLVABLE = 'radar.fetch.unresolvable';

    /** @var string un des codes ci-dessus */
    public $code;

    public function __construct(string $code)
    {
        parent::__construct($code);
        $this->code = $code;
    }
}
