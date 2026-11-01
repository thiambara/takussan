<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AiSuggestionDecision;

/** TCK-2384 (ADR-0076 §7) — une proposition de l'IA, en attente ou décidée. */
class AiSuggestion extends AbstractModel
{
    protected $fillable = [
        'usage_key', 'ai_call_id', 'subject_type', 'subject_id', 'proposal', 'confidence',
        'input_snapshot', 'decision', 'decided_by_id', 'decided_at', 'final_value', 'correction_diff',
    ];

    protected $casts = [
        'proposal' => 'array',
        'final_value' => 'array',
        'correction_diff' => 'array',
        'confidence' => 'decimal:3',
        'decision' => AiSuggestionDecision::class,
        'decided_at' => 'datetime',
    ];
}
