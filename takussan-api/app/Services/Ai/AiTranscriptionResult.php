<?php

namespace App\Services\Ai;

use App\Models\AiCall;

/**
 * TCK-2976 — le texte d'une transcription, la langue (celle que rend le fournisseur, sinon celle imposée à l'appel),
 * le maillon qui l'a produite et sa ligne de journal.
 */
final readonly class AiTranscriptionResult
{
    public function __construct(
        public string $text,
        public ?string $language,
        public ModelLink $link,
        public AiCall $call,
    ) {}
}
