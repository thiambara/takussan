<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Ai\ModelLink;

/** TCK-2383 (ADR-0076 §4, §5) — coupe-circuit, modèle forcé et plafond d'un usage. */
class AiUsageSetting extends AbstractModel
{
    protected $fillable = ['usage_key', 'enabled', 'forced_provider', 'forced_model', 'daily_budget_xof', 'updated_by_id'];

    protected $casts = [
        'enabled' => 'boolean',
        'daily_budget_xof' => 'decimal:2',
    ];

    public function forcedLink(?int $maxTokens): ?ModelLink
    {
        return filled($this->forced_provider) && filled($this->forced_model)
            ? new ModelLink($this->forced_provider, $this->forced_model, $maxTokens)
            : null;
    }
}
