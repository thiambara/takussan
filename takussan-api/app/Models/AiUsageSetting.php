<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Services\Ai\ModelLink;

/**
 * TCK-2383 (ADR-0076 §4, §5) — coupe-circuit, modèle forcé et plafond d'un usage. `daily_budget_usd`
 * n'est pas casté (ADR-0086) : il reste la chaîne décimale que rend PostgreSQL.
 */
class AiUsageSetting extends AbstractModel
{
    protected $fillable = ['usage_key', 'enabled', 'forced_provider', 'forced_model', 'daily_budget_usd', 'updated_by_id'];

    protected $casts = [
        'enabled' => 'boolean',
    ];

    public function forcedLink(?int $maxTokens): ?ModelLink
    {
        return filled($this->forced_provider) && filled($this->forced_model)
            ? new ModelLink($this->forced_provider, $this->forced_model, $maxTokens)
            : null;
    }
}
