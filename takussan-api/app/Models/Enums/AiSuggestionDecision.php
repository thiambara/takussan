<?php

namespace App\Models\Enums;

/** TCK-2384 (ADR-0076 §7) — la décision humaine sur une proposition de l'IA. */
enum AiSuggestionDecision: string
{
    case Pending = 'pending';
    case Accepted = 'accepted';
    case Edited = 'edited';
    case Rejected = 'rejected';
}
