<?php

namespace App\Services\Radar;

/** TCK-2386 (ADR-0077 §10) — une page d'annonce nettoyée par `HtmlCleaner`, prête pour l'extraction. */
final readonly class CleanedPage
{
    /**
     * @param  list<string>  $photoUrls  URL source absolues (http/https), jamais téléchargées
     * @param  list<string>  $phones  TCK-2465 — les numéros des attributs de la page (`PagePhones`), en E.164, sans ceux
     *                                du JSON-LD `Organization`
     */
    public function __construct(
        public string $text,
        public ?string $title,
        public array $photoUrls,
        public array $phones = [],
    ) {}
}
