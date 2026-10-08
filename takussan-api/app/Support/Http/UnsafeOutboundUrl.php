<?php

namespace App\Support\Http;

use RuntimeException;

/**
 * TCK-596 (ADR-0041 §7) — un appel sortant refusé ou échoué, avec son motif sous forme de CODE
 * (`not_https`, `private_address`, `redirect`, `too_large`…) : il est stocké sur le flux et rendu
 * par le front, jamais une phrase.
 */
class UnsafeOutboundUrl extends RuntimeException
{
    public function __construct(public readonly string $reason)
    {
        parent::__construct($reason);
    }
}
