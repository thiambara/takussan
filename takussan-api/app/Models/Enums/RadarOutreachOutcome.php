<?php

namespace App\Models\Enums;

/** TCK-2388 (ADR-0077 §3, §4) — l'issue d'un message de démarchage, posée par l'opérateur. */
enum RadarOutreachOutcome: string
{
    case Consented = 'consented';
    case Refused = 'refused';
    case Stop = 'stop';
    case Question = 'question';
    case NoAnswer = 'no_answer';

    /** Accord, refus et STOP closent l'échange ; une réponse déposée plus tard peut encore changer `question` ou `no_answer`. */
    public function isFinal(): bool
    {
        return in_array($this, [self::Consented, self::Refused, self::Stop], true);
    }
}
