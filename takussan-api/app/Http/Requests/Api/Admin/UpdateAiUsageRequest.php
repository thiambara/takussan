<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Models\AiUsageSetting;
use App\Rules\IdentifiantDeModele;
use App\Rules\MontantIa;
use Illuminate\Validation\Rule;

/** TCK-2385 — les réglages d'un usage ; seuls les champs présents changent. */
class UpdateAiUsageRequest extends BaseFormRequest
{
    /** Même raison qu'`UpdateAiRoleRequest::authorize()`. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        // Un fournisseur sorti de la configuration ne bloque pas un réglage qui ne le change pas.
        $provider = $this->keepsTheForcing() ? [] : [Rule::in(array_keys(config('ai.providers')))];

        return [
            'enabled' => ['sometimes', 'boolean'],
            // Pas de `sometimes` ici : il désactiverait `required_with` quand la clé est absente, et
            // `{forced_model: "x"}` seul passerait.
            'forced_provider' => ['nullable', 'required_with:forced_model', 'string', ...$provider],
            'forced_model' => ['nullable', 'required_with:forced_provider', 'string', 'max:255', new IdentifiantDeModele],
            'daily_budget_usd' => ['sometimes', 'nullable', new MontantIa],
        ];
    }

    /**
     * Le couple envoyé est celui en base : rien ne change, donc rien à rejuger. Sinon un forçage retiré ou sorti de la
     * configuration interdirait d'abaisser le plafond d'un usage dont le modèle reste appelé.
     */
    public function keepsTheForcing(): bool
    {
        $provider = $this->input('forced_provider');
        $model = $this->input('forced_model');
        if (! filled($provider) || ! filled($model)) {
            return false;
        }
        $setting = AiUsageSetting::query()->where('usage_key', $this->route('usage'))->first();

        return $setting !== null && $setting->forced_provider === $provider && $setting->forced_model === $model;
    }
}
