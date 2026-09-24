<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\Messaging\MessagingContactResource;
use App\Models\Conversation;
use App\Models\User;
use App\Services\Messaging\MessagingReach;
use App\Sorts\SearchRelevanceSort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\AllowedSort;
use Spatie\QueryBuilder\QueryBuilder;

/**
 * TCK-565 — `GET /api/conversations/contacts` : les personnes qu'un utilisateur peut inviter dans
 * une conversation de groupe, cherchées par leur NOM.
 *
 * Retour testeur du 2026-09-23 (M12) : « Où un utilisateur verrait-il son ID ? ». L'assistant
 * « Nouveau groupe » demandait un identifiant numérique que personne ne connaît. Cet endpoint sert
 * le sélecteur qui le remplace.
 *
 * Le périmètre est {@see MessagingReach}, c'est-à-dire EXACTEMENT celui que la création d'un groupe
 * et l'ajout d'un participant acceptent : le sélecteur ne propose personne que le serveur refuse.
 * Pas de capacité dédiée : créer un groupe n'est pas un privilège catalogué (aucune
 * `Capability` ne la garde), c'est le périmètre de relation et d'agence qui borne qui l'on joint.
 *
 * Deux portes, une règle :
 *
 *  - `GET /api/conversations/contacts` — pour un NOUVEAU groupe ;
 *  - `GET /api/conversations/{conversation}/contacts` — pour compléter un groupe EXISTANT. Réservée
 *    à ceux qui peuvent y ajouter quelqu'un (`ConversationPolicy::addParticipant`, 403 sinon), elle
 *    lit la règle AVEC la conversation, exactement comme `AddParticipantsRequest`, et ne propose
 *    pas les membres actuels. Sans elle, le sélecteur de la feuille d'infos lisait la règle d'un
 *    nouveau groupe et divergeait de ce que l'ajout accepte (relevé du vérificateur, 2026-09-23).
 *
 * **La recherche ne porte QUE sur le nom** (réparation 2, relevé du vérificateur, 2026-09-23).
 * La première version passait par `User::buildQuery()` : `filter[search]` y interroge
 * `$requestSearchFields` — e-mail, identifiant et téléphone compris — et `sort=email` y est permis.
 * La ressource n'en rendait rien, mais la LISTE répondait : chercher un fragment d'adresse
 * renvoyait « Awa Sarr », une recherche témoin rien. C'est un oracle — on vérifie les coordonnées
 * d'un contact sans les lire — et `MessagingContactResource` pose précisément que les coordonnées
 * ne sont pas une donnée de la messagerie. Même raisonnement pour `filter[status]`,
 * `filter[added_by_id]`, `filter[role]` et `include=` : des questions d'administration sur un
 * compte, pas sur un contact.
 *
 * Cet endpoint déclare donc SA propre liste blanche, étroite : un filtre (`search`, sur
 * `first_name` et `last_name` seulement — `attributesToSearchOn` de Meilisearch), deux tris (le
 * nom), trois colonnes. Tout autre paramètre rend 400 (`InvalidQuery` de spatie). La recherche
 * reste celle de Scout, tolérante aux fautes et aux accents, et son ordre de pertinence est
 * restitué ({@see SearchRelevanceSort}) ; sans recherche, tri alphabétique — une liste de personnes.
 */
class MessagingContactController extends Controller
{
    public function index(Request $request, MessagingReach $reach): JsonResponse
    {
        return $this->contacts($request, $reach->query($request->user()));
    }

    public function forConversation(Request $request, Conversation $conversation, MessagingReach $reach): JsonResponse
    {
        abort_unless($request->user()->can('addParticipant', $conversation), 403, __('messaging.errors.admin_only'));

        $base = $reach->query($request->user(), $conversation)
            ->whereDoesntHave('conversations', fn (Builder $c) => $c
                ->whereKey($conversation->getKey())
                ->whereNull('conversation_participants.left_at'));

        return $this->contacts($request, $base);
    }

    /** Les seuls attributs de l'index `users` qu'une recherche de contact interroge. */
    private const SEARCHABLE_NAME = ['first_name', 'last_name'];

    /** Même plafond que `HasQueryBuilder::SEARCH_ID_CAP` — le périmètre est intersecté ensuite. */
    private const SEARCH_ID_CAP = 5000;

    /** @param  Builder<User>  $base */
    private function contacts(Request $request, Builder $base): JsonResponse
    {
        $relevance = [];

        $query = QueryBuilder::for($base->with('media'), $request)
            ->allowedFields('id', 'first_name', 'last_name')
            ->allowedFilters(AllowedFilter::callback('search', function (Builder $q, mixed $value) use (&$relevance) {
                $terms = trim(is_array($value) ? implode(' ', $value) : (string) $value);
                if ($terms === '') {
                    return;
                }

                $relevance = User::search($terms)
                    ->options(['attributesToSearchOn' => self::SEARCHABLE_NAME])
                    ->take(self::SEARCH_ID_CAP)
                    ->keys()
                    ->all();

                $q->whereIn('users.id', $relevance);
            }))
            ->allowedSorts('first_name', 'last_name')
            // Aucune relation : l'appel VIDE est ce qui fait refuser un `include=` (400), qu'on
            // ignorerait sinon en silence.
            ->allowedIncludes();

        $defaults = ['first_name', 'last_name', 'id'];
        if (count($relevance) > 1 && SearchRelevanceSort::supports($relevance)) {
            array_unshift($defaults, AllowedSort::custom('search_relevance', new SearchRelevanceSort($relevance)));
        }
        $query->defaultSorts(...$defaults);

        $paginator = $query->paginate();

        return $this->paginated($paginator, MessagingContactResource::collection($paginator)->toArray($request));
    }
}
