<?php

namespace App\Http\Requests\Api\Admin;

use App\Http\Requests\BaseFormRequest;
use App\Rules\FournisseurSelectionnable;
use App\Rules\IdentifiantDeModele;
use App\Rules\MontantIa;
use App\Services\Ai\AiModelCatalogue;
use App\Services\Ai\AiProviderCatalogue;
use Illuminate\Validation\Rule;

/**
 * TCK-2448 (ADR-0085 §1) — un modèle d'un fournisseur sélectionnable et ses quatre tarifs, tous exigés : un
 * tarif nul se saisit, un tarif absent est refusé. `active` faux retire un modèle de la configuration.
 *
 * TCK-2450 — corriger ou retirer un modèle de la configuration n'en ajoute aucun : cela reste permis chez un
 * fournisseur déclaré sans clé. La passerelle ne l'appellera pas pour autant.
 */
class StoreAiModelRequest extends BaseFormRequest
{
    /** Même raison qu'`UpdateAiRoleRequest::authorize()`. */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $provider = $this->replacesAConfiguredModel()
            ? [Rule::in(array_keys(AiProviderCatalogue::declared()))]
            : [new FournisseurSelectionnable];

        return [
            'provider' => ['required', 'string', ...$provider],
            'model' => ['required', 'string', 'max:255', new IdentifiantDeModele, Rule::unique('ai_models', 'model')->where('provider', $this->input('provider'))],
            'input' => ['required', new MontantIa],
            'output' => ['required', new MontantIa],
            'cache_read' => ['required', new MontantIa],
            'cache_write' => ['required', new MontantIa],
            'active' => ['sometimes', 'boolean'],
        ];
    }

    private function replacesAConfiguredModel(): bool
    {
        $provider = $this->input('provider');
        $model = $this->input('model');

        return is_string($provider) && is_string($model)
            && app(AiModelCatalogue::class)->configuredPriceOf($provider, $model) !== null;
    }
}
