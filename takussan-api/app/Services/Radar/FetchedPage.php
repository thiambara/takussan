<?php

namespace App\Services\Radar;

/** TCK-2386 (ADR-0077 §10) — une page lue par `UrlFetcher` : l'URL finale, après redirections. */
final readonly class FetchedPage
{
    public function __construct(
        public string $url,
        public int $status,
        public string $body,
        public ?string $contentType,
    ) {}
}
