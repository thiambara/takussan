<?php

namespace App\Services\Ai\Exceptions;

use App\Models\AiCall;
use App\Models\Enums\AiRefusalReason;
use RuntimeException;

/** TCK-2383 — la passerelle a refusé avant le fournisseur ; le refus est déjà journalisé. */
final class AiRefused extends RuntimeException
{
    public function __construct(public readonly AiRefusalReason $reason, public readonly AiCall $call)
    {
        parent::__construct('ai.refused.'.$reason->value);
    }
}
