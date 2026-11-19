<?php

namespace App\Services\Pont;

/** TCK-2980 (ADR-0132 § 0) — ce qu'un pilote a lu d'un webhook : des messages entrants et des accusés, normalisés. */
final class LectureDuWebhook
{
    /**
     * @param  list<MessageEntrant>  $entrants
     * @param  list<AccuseEntrant>  $accuses
     */
    public function __construct(
        public readonly array $entrants = [],
        public readonly array $accuses = [],
    ) {}
}
