<?php

namespace App\Rules;

use App\Services\Ai\AiProviderCatalogue;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * TCK-2450 (ADR-0085 §4) — la règle commune de ce qui affecte un fournisseur : chaîne, modèle forcé, évaluation,
 * ajout de modèle. Déclaré, avec une clé et une adresse acceptée ; le double de la passerelle n'est jamais admis.
 */
class FournisseurSelectionnable implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $code = is_string($value) ? app(AiProviderCatalogue::class)->refusalCode($value) : 'ai.provider_unknown';
        match ($code) {
            null => null,
            'ai.provider_key_missing' => $fail('errors.ai.provider_key_missing')->translate(),
            'ai.provider_host_not_allowed' => $fail('errors.ai.provider_host_not_allowed')->translate(),
            default => $fail('errors.ai.provider_unknown')->translate(),
        };
    }
}
