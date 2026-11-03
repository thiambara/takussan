<?php

namespace App\Services\Ai\Exceptions;

use RuntimeException;
use Throwable;

/** TCK-2383 — aucun maillon n'a répondu (`ai.providers_unavailable`), ou le rôle n'en a aucun (`ai.role_unassigned`). */
final class AiUnavailable extends RuntimeException
{
    public function __construct(string $code, ?Throwable $previous = null)
    {
        parent::__construct($code, 0, $previous);
    }
}
