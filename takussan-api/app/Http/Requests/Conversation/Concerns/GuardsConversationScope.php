<?php

namespace App\Http\Requests\Conversation\Concerns;

use App\Models\Conversation;
use App\Models\User;
use App\Services\Messaging\MessagingReach;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Validator;

/**
 * TCK-565 — les deux gardes de périmètre que partagent TOUS les chemins qui ouvrent une
 * conversation par l'API : la directe (`StoreConversationRequest`) et le groupe
 * (`CreateGroupConversationRequest`).
 *
 * ⚠️ **Les deux chemins doivent appliquer la même règle, et c'est la raison d'être de ce trait.**
 * Relevé du vérificateur (2026-09-23, réparation 2) : seul le groupe vérifiait la joignabilité.
 * Une conversation DIRECTE à N inconnus rendait 201, ces inconnus devenaient des
 * « correspondants » (règle 1 de {@see MessagingReach}), le sélecteur les listait par nom, et le
 * groupe qu'on venait de refuser passait à la requête suivante. *Une garde qu'une autre route
 * contourne n'est pas une garde : c'est un détour de plus.*
 */
trait GuardsConversationScope
{
    /**
     * Une seule erreur sur `$field` si l'un des comptes est hors d'atteinte — jamais une par
     * position du tableau (M13).
     *
     * @param  array<int, int|string>  $userIds
     */
    protected function guardReach(Validator $v, User $actor, array $userIds, string $field, ?Conversation $conversation = null): void
    {
        if ($userIds === [] || $v->errors()->has($field)) {
            return;
        }

        if (app(MessagingReach::class)->outOfReach($actor, $userIds, $conversation) !== []) {
            $v->errors()->add($field, __('messaging.errors.participants_out_of_reach'));
        }
    }

    /**
     * Le bien, le bail ou la demande d'intervention rattachés doivent être VISIBLES de l'acteur
     * (leurs policies `view`). Ce n'est pas qu'une question de lecture : le rattachement ouvre
     * ensuite, pour un groupe, l'ajout de l'équipe de l'agence de ce bien (règle 4).
     *
     * @param  array<string, class-string<Model>>  $contexts  champ du corps → modèle
     */
    protected function guardContext(Validator $v, User $actor, array $contexts, string $messageKey): void
    {
        foreach ($contexts as $field => $class) {
            $id = $this->input($field);
            if ($id === null || $v->errors()->has($field)) {
                continue;
            }

            $model = $class::query()->find($id);
            if ($model !== null && ! $actor->can('view', $model)) {
                $v->errors()->add($field, __($messageKey));
            }
        }
    }
}
