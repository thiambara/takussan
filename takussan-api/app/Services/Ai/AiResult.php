<?php

namespace App\Services\Ai;

use App\Models\AiCall;

/** TCK-2383 — la réponse d'un usage : le texte, la sortie structurée s'il y en a une, sa ligne de journal. */
final readonly class AiResult
{
    /** @param  array<string, mixed>|null  $structured */
    public function __construct(
        public string $text,
        public ?array $structured,
        public AiCall $call,
        public bool $fromCache,
    ) {}
}
