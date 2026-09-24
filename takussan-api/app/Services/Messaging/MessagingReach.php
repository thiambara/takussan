<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * TCK-565 — **qui un utilisateur peut-il faire entrer dans une conversation de groupe ?**
 *
 * Une seule règle, trois usages :
 *
 *  - `GET /api/conversations/contacts` la LISTE pour un NOUVEAU groupe, et
 *    `GET /api/conversations/{conversation}/contacts` pour un groupe EXISTANT — les deux sources
 *    du sélecteur par nom du front ;
 *  - `CreateGroupConversationRequest` l'APPLIQUE à la création d'un groupe, et
 *    `StoreConversationRequest` à celle d'une conversation DIRECTE (réparation 2 : sans elle, une
 *    directe faisait de n'importe quel inconnu un correspondant — règle 1 —, donc un contact que
 *    le groupe acceptait ensuite ; les deux passent par `GuardsConversationScope`) ;
 *  - `AddParticipantsRequest` l'applique à l'ajout d'un participant, AVEC la conversation : c'est
 *    elle qui ajoute la règle 4 ci-dessous, et le sélecteur la reçoit par la même méthode.
 *
 * ⚠️ **Les trois doivent lire la MÊME règle, et c'est la raison d'être de cette classe.** Un
 * sélecteur qui proposerait une personne que le serveur refuse ensuite, ou un serveur qui
 * accepterait une personne que le sélecteur ne montre pas, reproduirait sous une autre forme le
 * défaut que le retour testeur du 2026-09-23 relevait (M12, M13) : l'utilisateur ne peut pas
 * savoir d'avance qui il a le droit d'inviter.
 *
 * Avant TCK-565, la règle n'existait que dans `AddParticipantsRequest::candidateInScope()`, sous
 * forme d'un test par candidat — impossible à LISTER. La création de groupe, elle, n'en appliquait
 * aucune, malgré un docblock qui affirmait le contraire.
 *
 * Est joignable (union, jamais l'acteur lui-même, jamais un compte supprimé) :
 *
 *  1. **un correspondant** — quelqu'un avec qui l'acteur partage déjà une conversation ;
 *  2. **un lien CRM** (`user_customer_relationships`) — les deux comptes sont rattachés à une même
 *     fiche client, OU l'un est rattaché à la fiche dont l'autre est le client (`customers.user_id`) :
 *     un propriétaire joint son locataire, et le locataire son propriétaire ;
 *  3. **l'agence active de l'acteur** (principe n°2 : l'agence est la frontière) :
 *     - son **équipe** (agents, administrateurs) est joignable par tout membre de l'agence ;
 *     - ses **propriétaires** ne le sont que par l'équipe. Un propriétaire n'a pas à découvrir
 *       les autres clients de l'agence dans un sélecteur. C'est plus strict que l'ancienne
 *       comparaison `agency_id === agency_id` de `candidateInScope()`, qui laissait un
 *       propriétaire inviter un autre propriétaire de la même agence ; resserré délibérément ;
 *  4. **pour une conversation existante seulement : l'équipe de l'agence de son bien** (ou du bien
 *     de son bail). C'était la règle propre d'`AddParticipantsRequest` ; elle vit ici pour que le
 *     sélecteur la LISTE aussi, au lieu que le serveur accepte des personnes qu'il ne montre pas.
 *     Resserrée comme la règle 3 : l'équipe, pas les autres clients de cette agence.
 *
 * **Seuls les profils ACTIFS comptent** (règles 3 et 4, des deux côtés) : un profil `draft` est une
 * invitation pas encore acceptée, un profil `suspended` ou `inactive` n'agit plus pour l'agence.
 * `isAgentAt()` ignore le statut — c'est la convention du dépôt pour l'autorisation, pas une
 * raison de proposer dans un sélecteur quelqu'un qui n'est pas (ou plus) dans l'équipe.
 *
 * ⚠️ **La conversation en cours compte comme une relation** (règle 1). Une version précédente
 * l'excluait à l'ajout de participants, mais pas dans la liste : le sélecteur proposait une
 * personne qui avait quitté le groupe, et le serveur la refusait (relevé du vérificateur,
 * 2026-09-23). La ré-invitation d'un ancien membre est un chemin prévu
 * (`GroupConversationService::addParticipants`, « Re-invite path ») : c'est l'exclusion qui était
 * fausse, pas la liste.
 *
 * L'agence est `User::$agency_id`, c'est-à-dire le profil actif de la requête, ou l'agence unique
 * de l'utilisateur. Un compte présent dans plusieurs agences sans profil actif n'a pas d'agence :
 * la règle 3 ne lui ouvre alors rien, plutôt que de choisir une agence à sa place.
 */
class MessagingReach
{
    /**
     * Les utilisateurs joignables par `$actor`, en requête Eloquent composable (filtres, tri,
     * pagination, `HasQueryBuilder`).
     *
     * @param  Conversation|null  $conversation  le groupe EXISTANT qu'on complète : il ajoute la
     *                                           règle 4 (l'équipe de l'agence de son bien).
     * @return Builder<User>
     */
    public function query(User $actor, ?Conversation $conversation = null): Builder
    {
        $agencyId = $actor->agency_id;
        $actorIsStaff = $agencyId !== null && $this->isActiveStaffAt($actor, $agencyId);
        $contextAgencyId = $conversation !== null ? $this->contextAgencyId($conversation) : null;

        return User::query()
            ->whereKeyNot($actor->getKey())
            ->where(function (Builder $reach) use ($actor, $agencyId, $actorIsStaff, $contextAgencyId) {
                // 1. Correspondants.
                $reach->whereIn('users.id', function (QueryBuilder $sub) use ($actor) {
                    $sub->select('cpb.user_id')
                        ->from('conversation_participants as cpa')
                        ->join('conversation_participants as cpb', 'cpa.conversation_id', '=', 'cpb.conversation_id')
                        ->where('cpa.user_id', $actor->id);
                });

                // 2. Lien CRM, dans les trois sens où une fiche client relie deux comptes :
                //    a. une même fiche rattachée aux deux (le propriétaire et l'agent d'un client) ;
                $reach->orWhereIn('users.id', function (QueryBuilder $sub) use ($actor) {
                    $sub->select('ucrb.user_id')
                        ->from('user_customer_relationships as ucra')
                        ->join('user_customer_relationships as ucrb', 'ucra.customer_id', '=', 'ucrb.customer_id')
                        ->where('ucra.user_id', $actor->id);
                });
                //    b. le compte du client d'une fiche à laquelle l'acteur est rattaché ;
                $reach->orWhereIn('users.id', function (QueryBuilder $sub) use ($actor) {
                    $sub->select('c.user_id')
                        ->from('user_customer_relationships as ucr')
                        ->join('customers as c', 'c.id', '=', 'ucr.customer_id')
                        ->where('ucr.user_id', $actor->id)
                        ->whereNotNull('c.user_id');
                });
                //    c. et, en retour, ceux qui sont rattachés à la fiche qui représente l'acteur.
                $reach->orWhereIn('users.id', function (QueryBuilder $sub) use ($actor) {
                    $sub->select('ucr.user_id')
                        ->from('user_customer_relationships as ucr')
                        ->join('customers as c', 'c.id', '=', 'ucr.customer_id')
                        ->where('c.user_id', $actor->id);
                });

                // 3. L'agence active.
                if ($agencyId !== null) {
                    $this->orTeamOf($reach, $agencyId);

                    if ($actorIsStaff) {
                        $reach->orWhereHas('ownerProfiles', fn (Builder $p) => $p->active()->where('agency_id', $agencyId));
                    }
                }

                // 4. L'équipe de l'agence du bien de la conversation qu'on complète.
                if ($contextAgencyId !== null && $contextAgencyId !== $agencyId) {
                    $this->orTeamOf($reach, $contextAgencyId);
                }
            });
    }

    /**
     * Les identifiants de `$userIds` que `$actor` ne peut PAS joindre. L'acteur lui-même n'y
     * figure jamais : l'inclure est redondant, pas interdit (le service le retire).
     *
     * @param  array<int, int|string>  $userIds
     * @return list<int>
     */
    public function outOfReach(User $actor, array $userIds, ?Conversation $conversation = null): array
    {
        $wanted = array_values(array_unique(array_filter(
            array_map('intval', $userIds),
            fn (int $id) => $id !== (int) $actor->id,
        )));

        if ($wanted === []) {
            return [];
        }

        $reachable = $this->query($actor, $conversation)
            ->whereIn('users.id', $wanted)
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return array_values(array_diff($wanted, $reachable));
    }

    /** L'équipe ACTIVE d'une agence : ses agents et ses administrateurs. */
    private function orTeamOf(Builder $reach, int $agencyId): void
    {
        $reach->orWhereHas('agentProfiles', fn (Builder $p) => $p->active()->where('agency_id', $agencyId))
            ->orWhereHas('agencyAdminProfiles', fn (Builder $p) => $p->active()->where('agency_id', $agencyId));
    }

    private function isActiveStaffAt(User $actor, int $agencyId): bool
    {
        return $actor->agentProfiles()->active()->where('agency_id', $agencyId)->exists()
            || $actor->agencyAdminProfiles()->active()->where('agency_id', $agencyId)->exists();
    }

    /** L'agence du bien de la conversation, ou du bien de son bail — `null` sans contexte. */
    private function contextAgencyId(Conversation $conversation): ?int
    {
        $agencyId = $conversation->property_id ? $conversation->property?->agency_id : null;
        if ($agencyId === null && $conversation->lease_id) {
            $agencyId = $conversation->lease?->property?->agency_id;
        }

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
