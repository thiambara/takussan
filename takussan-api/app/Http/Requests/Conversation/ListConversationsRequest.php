<?php

namespace App\Http\Requests\Conversation;

use App\Http\Controllers\Api\ConversationController;
use App\Http\Requests\BaseFormRequest;
use App\Models\Enums\ConversationType;
use Closure;
use Illuminate\Validation\Rule;

/**
 * TCK-2630 — `GET /api/conversations` ({@see ConversationController::index()}) : les filtres de la
 * liste (trois au TCK-2630, `participant` au TCK-2632). Seuls eux sont typés ici ; `fields[]`, `include`, `sort` et `per_page`, que le front
 * envoie, restent lus comme avant.
 *
 * Une saisie mal formée — un type inconnu, un `unread` qui n'est pas un booléen, une recherche en
 * tableau — est une erreur du CLIENT : 422, jamais un filtre ignoré en silence. Une recherche d'un
 * seul caractère, elle, est bien formée : le contrôleur l'ignore (règle du ticket).
 */
class ListConversationsRequest extends BaseFormRequest
{
    /** Au-delà, la saisie est une phrase, pas une recherche de fil. */
    public const SEARCH_MAX = 120;

    /** Les deux puces de la liste ; les autres types de l'enum n'en ont pas (ticket). */
    public const TYPES = [ConversationType::Direct->value, ConversationType::Group->value];

    /**
     * La route exige une session (`auth:sanctum`) ; le périmètre est celui de
     * `ConversationAccess::constrainListing`, dans le contrôleur, qui n'autorisait rien avant.
     */
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'filter' => ['sometimes', 'array'],
            'filter.search' => [
                'sometimes', 'nullable', 'string', 'max:'.self::SEARCH_MAX,
                // Un octet hors UTF-8 (`%C3%28`) faisait rendre `false` au découpage en mots
                // (`preg_split(…/u)`) : la recherche était ignorée EN SILENCE et la liste entière
                // revenait. Mal formée, elle est refusée comme le reste.
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && ! mb_check_encoding($value, 'UTF-8')) {
                        $fail('validation.string')->translate();
                    }
                },
            ],
            'filter.unread' => ['sometimes', 'nullable', Rule::in(['0', '1', 'true', 'false'])],
            'filter.type' => ['sometimes', 'nullable', Rule::in(self::TYPES)],
            // TCK-2632 — « Nouvelle conversation » cherche le fil direct déjà ouvert avec une
            // personne. Un identifiant, jamais un nom : deux homonymes ne se confondent pas.
            // Jamais l'appelant (vérification adverse) : membre de tous ses fils, il rendrait sa liste
            // entière, archives comprises (le filtre les ouvre) — 422, comme toute saisie sans objet.
            'filter.participant' => ['sometimes', 'nullable', 'integer', 'min:1', Rule::notIn(array_filter([$this->user()?->id]))],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'filter' => __('messaging.attributes.filters'),
            'filter.search' => __('messaging.attributes.search_filter'),
            'filter.unread' => __('messaging.attributes.unread_filter'),
            'filter.type' => __('messaging.attributes.type_filter'),
            'filter.participant' => __('messaging.attributes.participant_filter'),
        ];
    }
}
