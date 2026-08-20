<?php

namespace App\Http\Requests\Api\Auth;

use App\Http\Requests\BaseFormRequest;

/**
 * TCK-305 — extrait de `AbstractOAuthController::callback()`, où les règles étaient en ligne.
 *
 * L'action vit sur une classe **abstraite** dont deux contrôleurs concrets héritent
 * (`AppleOAuthController`, `FacebookOAuthController`) : c'est la signature héritée que Laravel
 * réfléchit, donc l'injection du FormRequest vaut pour les deux routes sans les dupliquer.
 *
 * ⚠ **Ordre changé, et il est visible.** Le contrôleur vérifiait d'abord que le fournisseur est
 * configuré (422 « OAuth provider is not configured. ») puis validait. La validation d'un
 * FormRequest court AVANT le corps : un appel sur un fournisseur non configuré ET sans `code`
 * rend désormais les erreurs de validation plutôt que le message de configuration. Les deux
 * restent des 422 — le code de réponse ne change pas, seul le corps change dans ce cas croisé.
 */
class OAuthCallbackRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : c'est une route publique, la garde est le `state` OAuth
     * vérifié dans le corps du contrôleur. `BaseFormRequest` refuse par défaut — *fail-closed* —
     * donc sans cette surcharge l'endpoint rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ];
    }
}
