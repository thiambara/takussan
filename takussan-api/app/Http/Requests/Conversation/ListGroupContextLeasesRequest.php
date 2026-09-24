<?php

namespace App\Http\Requests\Conversation;

use App\Http\Controllers\Api\ConversationContextController;
use App\Http\Requests\BaseFormRequest;

/**
 * TCK-576, réparation 1 — `GET /api/conversations/context/leases`
 * ({@see ConversationContextController::leases()}).
 *
 * `filter[property_id]=abc` rendait 500 : PostgreSQL refusait la conversion en `bigint`
 * (`SQLSTATE[22P02]`), et le message SQL s'affichait en débogage local. Une saisie mal formée est
 * une erreur du CLIENT : 422. Seul ce filtre est typé ici ; la liste blanche des paramètres
 * (400 pour le reste) reste celle du `QueryBuilder` du contrôleur.
 */
class ListGroupContextLeasesRequest extends BaseFormRequest
{
    /**
     * L'autorisation NE vit PAS ici : la route exige une session (`auth:sanctum`), et le périmètre
     * est la traduction en requête de `LeasePolicy::view()`, dans le contrôleur. `BaseFormRequest`
     * refuse par défaut — *fail-closed* —, d'où cette surcharge.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter.property_id' => ['sometimes', 'integer'],
        ];
    }

    /**
     * Reprise du 2026-09-24 — sans ce nom, Laravel le fabrique depuis la clé à points : le 422
     * disait « Le champ filter.property id doit être un nombre entier. »
     *
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'filter.property_id' => __('messaging.attributes.property_filter'),
        ];
    }
}
