<?php

namespace App\Services\Credits;

use Carbon\CarbonInterface;

/**
 * TCK-633 lot F (ADR-0061 §4) — un remboursement réparti par lot d'origine.
 *
 * `refunded` est ce qui est RÉELLEMENT rendu (la somme des `shares`) ; `expired` ce qui ne l'est
 * pas parce que le lot d'origine a déjà expiré. `refunded + expired` vaut le prorata demandé, borné
 * à ce que le boost a payé.
 */
final readonly class RefundPlan
{
    /**
     * @param  list<array{lot_id: int, amount: int, expires_at: ?CarbonInterface}>  $shares
     */
    public function __construct(
        public int $refunded = 0,
        public int $expired = 0,
        public array $shares = [],
    ) {}
}
