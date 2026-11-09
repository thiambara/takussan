<?php

namespace App\Http\Requests\Api\Me;

use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Concerns\AuthorizesTransitionally;
use Illuminate\Validation\Rule;

/**
 * TCK-2518 — ce que l'agent dit de lui à l'annuaire public : ses langues et ses quartiers.
 *
 * Un endpoint à part (`PATCH /api/me/agent-profiles/{id}/directory`) et non deux clés de plus sur
 * `…/specialization` : celui-ci EXIGE la spécialité (c'est l'étape de l'assistant d'arrivée), et
 * l'écran de profil qui saisit les langues n'a pas à la renvoyer. Même règle d'accès que ses voisins :
 * le compte qui possède le profil, et lui seul.
 *
 * Deux clés facultatives : absente, rien ne change ; `null` ou `[]`, la liste est vidée.
 */
class UpdateDirectoryAgentProfileRequest extends BaseFormRequest
{
    use AuthorizesTransitionally;

    /** Le plafond de quartiers d'un agent (`agent_profiles.neighborhood_ids`). */
    public const MAX_NEIGHBORHOODS = 5;

    public function authorize(): bool
    {
        return $this->ownsProfile($this->route('agent_profile'));
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $langues = (array) config('directory.languages', []);

        return [
            'languages' => ['sometimes', 'nullable', 'array', 'list', 'max:'.count($langues)],
            'languages.*' => ['required', 'string', 'distinct', Rule::in($langues)],
            'neighborhood_ids' => ['sometimes', 'nullable', 'array', 'list', 'max:'.self::MAX_NEIGHBORHOODS],
            'neighborhood_ids.*' => ['required', 'integer', 'distinct', Rule::exists('geo_neighborhoods', 'id')],
        ];
    }
}
