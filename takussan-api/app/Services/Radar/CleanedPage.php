<?php

namespace App\Services\Radar;

/** TCK-2386 (ADR-0077 §10) — une page d'annonce nettoyée par `HtmlCleaner`, prête pour l'extraction. */
final readonly class CleanedPage
{
    /** @param list<string> $photoUrls URL source absolues (http/https), jamais téléchargées */
    public function __construct(
        public string $text,
        public ?string $title,
        public array $photoUrls,
    ) {}
}
