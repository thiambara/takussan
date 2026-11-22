<?php

namespace App\Services\Search;

use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EquipeDuFil;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Support\Carbon;
use Laravel\Scout\Builder as ScoutBuilder;
use Meilisearch\Endpoints\Indexes;

class MessageSearchService
{
    public function __construct(private readonly ConversationAccess $access) {}

    /**
     * @param  array<string, mixed>  $params  Validated search parameters
     */
    public function search(User $user, array $params): LengthAwarePaginator
    {
        $conversationIds = $this->userConversationIds($user);

        // Scope + equality filters run as native Scout clauses so the search
        // engine filters and paginates server-side — yielding a correct total.
        // An empty conversation list resolves to "IN []", which matches nothing.
        // TCK-2965 (ADR-0128 § 6) — les notes d'équipe sont écartées DANS le moteur, par un filtre composé
        // avec celui de Scout ({@see self::filtreDesNotes()}) : `total` et les pages restent justes. Le
        // modèle de `DocumentSearchService` (TCK-2781).
        $notes = $this->filtreDesNotes($user, $conversationIds);
        $search = Message::search($params['q'], function ($index, $query, $options) use ($notes) {
            // Les moteurs `collection` et `database` rappellent avec la requête Eloquent, et ne posent alors
            // aucune clause du builder : on les rejoue. La règle des notes s'y pose par `query()` ci-dessous,
            // que Scout applique à l'hydratation et au recompte du total.
            if ($index instanceof EloquentBuilder && $query instanceof ScoutBuilder) {
                $this->rejouerLesClauses($index, $query);

                return $index;
            }

            if ($notes !== null) {
                $scout = (string) ($options['filter'] ?? '');
                $options['filter'] = $scout !== '' ? "({$scout}) AND {$notes}" : $notes;
            }

            return $this->interroger($index, (string) $query, $options);
        })
            ->whereIn('conversation_id', $conversationIds);

        // TCK-2965 — la règle SQL des notes (`ConversationAccess::messagesLisiblesPar`) sur les résultats
        // hydratés et sur le recompte du total : la seule règle des moteurs `collection` et `database`, et la
        // défense d'un index en retard sur la base (une ligne devenue `team` que l'index croit `all`).
        $search->query(fn (EloquentBuilder $query) => $this->access->messagesLisiblesPar($user, $query));

        if (! empty($params['filter']['conversation'])) {
            $search->where('conversation_id', (int) $params['filter']['conversation']);
        }

        if (($params['sort'] ?? null) === '-created_at') {
            $search->orderBy('created_at', 'desc');
        }

        // TCK-786 (P16.05) — la plage de dates filtre DANS le moteur, comme le périmètre :
        // passée en SQL par `query()`, elle s'appliquait à une page déjà découpée par
        // Meilisearch (pages vides, correspondances inatteignables). `created_at` est indexé
        // en timestamp et filtrable ; les bornes restent inclusives au jour, comme `whereDate`.
        if (! empty($params['filter']['date_from'])) {
            $search->where('created_at', '>=', Carbon::parse($params['filter']['date_from'])->startOfDay()->timestamp);
        }

        if (! empty($params['filter']['date_to'])) {
            $search->where('created_at', '<=', Carbon::parse($params['filter']['date_to'])->endOfDay()->timestamp);
        }

        // TCK-1010 (P59.02) — `MessageResource` lit les pièces jointes de chaque message : le
        // paginateur de Scout ne précharge rien, comme `DocumentSearchService`.
        $paginator = $search->paginate((int) ($params['per_page'] ?? 20));
        $paginator->getCollection()->loadMissing('media');

        return $paginator;
    }

    /**
     * TCK-2965 (ADR-0128 § 6) — le filtre Meilisearch des notes d'équipe : `visibility = all`, ou le fil
     * est l'un de ceux dont le lecteur lit les notes ({@see EquipeDuFil::filsOuLesNotesSeLisent()}),
     * parmi les fils de la recherche. `null` : aucun filtre (le super-admin hors impersonation, qui lit
     * les notes). Un document sans `visibility` (indexé avant TCK-2965) ne passe par aucune branche.
     *
     * @param  list<int>  $conversationIds
     */
    public function filtreDesNotes(User $user, array $conversationIds): ?string
    {
        $fils = EquipeDuFil::filsOuLesNotesSeLisent($user);
        if ($fils === null) {
            return null;
        }

        $ids = $conversationIds === [] ? [] : $fils->whereIn('cn.id', $conversationIds)
            ->pluck('cn.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return $ids === []
            ? "visibility = 'all'"
            : "(visibility = 'all' OR conversation_id IN [".implode(', ', $ids).'])';
    }

    /**
     * TCK-2965 — les clauses du builder Scout rejouées en SQL pour les moteurs `collection` et `database`
     * (le patron de `DocumentSearchService::restreindreEnSql`) : avec une fonction de rappel, ils n'en
     * posent aucune.
     *
     * @param  EloquentBuilder<Message>  $query
     */
    private function rejouerLesClauses(EloquentBuilder $query, ScoutBuilder $builder): void
    {
        foreach ($builder->wheres as $where) {
            if ($where['field'] === '__soft_deleted') {
                continue;
            }
            $valeur = $where['field'] === 'created_at' ? Carbon::createFromTimestamp($where['value']) : $where['value'];
            $query->where($where['field'], $where['operator'], $valeur);
        }
        foreach ($builder->whereIns as $champ => $valeurs) {
            $query->whereIn($champ, $valeurs);
        }
    }

    /**
     * L'appel au moteur, isolé pour qu'un test lise le filtre réellement envoyé.
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    protected function interroger(Indexes $index, string $query, array $options): array
    {
        return $index->rawSearch($query, $options);
    }

    /**
     * TCK-592 (passe 2, N1) — les fils que la garde de conversation ouvre, pas la seule
     * participation : un prestataire en pause y retrouvait le texte et les notes vocales.
     *
     * @return list<int>
     */
    private function userConversationIds(User $user): array
    {
        return $this->access->participatingQuery($user)
            ->pluck('conversations.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
