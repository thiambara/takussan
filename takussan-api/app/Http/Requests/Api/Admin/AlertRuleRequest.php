<?php

namespace App\Http\Requests\Api\Admin;

use App\Domain\Alerts\AlertableEvents;
use App\Http\Requests\BaseFormRequest;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de `AlertRuleController::validated()`, où les règles étaient écrites en ligne.
 *
 * Ce site est le seul des 120 dont les règles n'étaient pas dans une action de route mais dans un
 * **helper privé** partagé, paramétré par un drapeau `$partial` qui basculait `required` en
 * `sometimes`. Un FormRequest ne s'injecte que dans une action ; d'où une classe abstraite qui
 * porte la table de règles une seule fois, et deux sous-classes qui ne décident que de la
 * présence. *Le drapeau booléen était déjà la forme dégradée de ces deux classes : il vivait
 * dans l'appelant, donc il n'était vérifiable nulle part.*
 *
 * @see StoreAlertRuleRequest
 * @see UpdateAlertRuleRequest
 */
abstract class AlertRuleRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE migre PAS ici : la route est déjà gardée par le middleware alias
     * `super-admin` (`EnsureSuperAdmin`), et c'est là qu'elle doit rester (principe 2, TCK-306).
     * `BaseFormRequest` refuse par défaut — *fail-closed* — donc sans cette surcharge l'endpoint
     * rendrait 403 pour tout le monde.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * `required` à la création, `sometimes` à la mise à jour partielle.
     */
    abstract protected function presence(): string;

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $required = $this->presence();

        return [
            'event' => [$required, 'string', Rule::in(array_keys(AlertableEvents::all()))],
            'channels' => [$required, 'array', 'min:1'],
            'channels.*' => ['string', Rule::in(['email', 'slack', 'discord'])],
            'recipients' => [$required, 'array'],
            'recipients.emails' => ['nullable', 'array'],
            'recipients.emails.*' => ['email'],
            'recipients.webhooks' => ['nullable', 'array'],
            'recipients.webhooks.*' => ['url'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
