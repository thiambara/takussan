<?php

namespace App\Models\Enums;

/** TCK-2385 — l'état d'une évaluation lancée depuis la console. */
enum AiEvaluationStatus: string
{
    case Queued = 'queued';
    case Running = 'running';
    case Done = 'done';
    case Failed = 'failed';
}
