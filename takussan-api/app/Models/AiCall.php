<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiModelRole;
use App\Models\Enums\AiRefusalReason;

/**
 * TCK-2383 (ADR-0076 §5) — une ligne du journal des appels IA. Écrite par `AiGateway` seul.
 * `cost_estimate_usd` n'est pas casté (ADR-0086) : il reste la chaîne décimale que rend PostgreSQL.
 */
class AiCall extends AbstractModel
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'usage_key', 'role', 'provider', 'model', 'prompt_version',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens',
        'cost_estimate_usd', 'duration_ms', 'outcome', 'stop_reason', 'refusal_reason', 'error_code', 'warning',
        'is_evaluation', 'agency_id', 'actor_id', 'subject_type', 'subject_id',
    ];

    protected $casts = [
        'role' => AiModelRole::class,
        'outcome' => AiCallOutcome::class,
        'refusal_reason' => AiRefusalReason::class,
        'is_evaluation' => 'boolean',
    ];
}
