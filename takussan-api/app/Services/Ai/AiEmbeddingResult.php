<?php

namespace App\Services\Ai;

use App\Models\AiCall;

/** TCK-2423 — les vecteurs d'un usage, dans l'ordre des entrées, le maillon qui les a calculés et sa ligne de journal. */
final readonly class AiEmbeddingResult
{
    /** @param  list<list<float>>  $vectors */
    public function __construct(
        public array $vectors,
        public ModelLink $link,
        public AiCall $call,
    ) {}
}
