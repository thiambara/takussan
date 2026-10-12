<?php

namespace App\Services\Credits;

use RuntimeException;

/** TCK-633 lot F — solde insuffisant ; l'appelant HTTP le traduit en 422 `credits.insufficient`. */
final class InsufficientCredits extends RuntimeException
{
    public function __construct(public readonly int $required, public readonly int $balance)
    {
        parent::__construct("Solde insuffisant : {$balance} pour {$required}.");
    }

    public function missing(): int
    {
        return max(0, $this->required - $this->balance);
    }
}
