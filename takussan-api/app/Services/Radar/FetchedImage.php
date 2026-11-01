<?php

namespace App\Services\Radar;

/**
 * TCK-2387 (ADR-0077 §10) — une photo source lue par `UrlFetcher::fetchImage()` : l'URL finale, après
 * redirections, les octets (en mémoire seulement) et le type et les dimensions lus dans ces octets.
 */
final readonly class FetchedImage
{
    public function __construct(
        public string $url,
        public string $bytes,
        public string $mime,
        public int $width,
        public int $height,
    ) {}
}
