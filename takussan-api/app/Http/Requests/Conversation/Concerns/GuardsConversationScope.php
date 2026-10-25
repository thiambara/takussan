<?php

namespace App\Http\Requests\Conversation\Concerns;

use App\Models\Conversation;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
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

            // ⚠ `null` se REFUSE (2026-09-24). `exists:<table>,id` accepte une ligne supprimée — il
            // ne lit pas `deleted_at` —, puis `find()` la masque par la portée `SoftDeletes`. Tant
            // que `null` passait son tour, un groupe se rattachait au bien supprimé d'une autre
            // agence (201, `GroupConversationCreationTest::test_un_contexte_supprime_…`).
            $model = $class::query()->find($id);
            if ($model === null || ! $actor->can('view', $model)) {
                $v->errors()->add($field, __($messageKey));
            }
        }
    }

    /**
     * TCK-2191 (P191.04, décision du porteur du 2026-10-24) — un groupe rattaché à un bail ne compte
     * que des personnes qui LISENT ce bail (`LeasePolicy::view` : parties au bail, personnel actif
     * de l'agence), `docs/features.md` § 1.7. {@see guardReach()} ne juge que la joignabilité : un
     * simple correspondant de l'acteur entrait dans le fil du locataire et en lisait l'historique.
     *
     * Seule exception : le prestataire ASSIGNÉ à l'intervention que le groupe porte
     * (`maintenance_request_id`), dans le fil de cette intervention (TCK-592,
     * `SyncMaintenanceConversation`, qui passe par le service et non par ces requêtes). Un autre
     * artisan ou un tiers se joint par un groupe sans bail rattaché.
     *
     * À appeler après {@see guardContext()} : on ne juge les participants que face à un bail que
     * l'acteur voit. Une seule erreur sur `$field`, comme {@see guardReach()}.
     *
     * @param  array<int, int|string>  $userIds
     */
    protected function guardLeaseReaders(Validator $v, mixed $leaseId, array $userIds, string $field, mixed $maintenanceRequestId = null): void
    {
        if ($leaseId === null || $userIds === [] || $v->errors()->has($field)) {
            return;
        }

        $lease = Lease::query()->find($leaseId);
        if ($lease === null) {
            return;
        }

        $assignee = $maintenanceRequestId === null ? null : MaintenanceRequest::query()
            ->whereKey($maintenanceRequestId)
            ->where('lease_id', $lease->getKey())
            ->value('assigned_to');

        $users = User::query()->whereIn('id', array_map('intval', $userIds))->get();
        foreach ($users as $user) {
            if ($assignee !== null && (int) $assignee === $user->id) {
                continue;
            }
            if (! $user->can('view', $lease)) {
                $v->errors()->add($field, __('messaging.errors.participants_cannot_read_lease'));

                return;
            }
        }
    }

    /**
     * TCK-576, réparation 1 — un bail et un bien rattachés ENSEMBLE doivent aller ensemble.
     *
     * {@see guardContext()} juge chaque champ séparément : un bien et un bail visibles l'un et
     * l'autre, mais sans rapport, passaient (mesuré : `property_id=1` + `lease_id=363` → 201). Le
     * sélecteur du front les restreint l'un à l'autre, mais une garde qu'un autre client contourne
     * n'en est pas une. À appeler APRÈS `guardContext()` : on ne compare que deux contextes déjà
     * acceptés, pour ne jamais dire « ne concerne pas » d'un bail qu'on ne peut pas voir.
     */
    protected function guardLeaseMatchesProperty(Validator $v): void
    {
        $propertyId = $this->input('property_id');
        $leaseId = $this->input('lease_id');
        if ($propertyId === null || $leaseId === null
            || $v->errors()->has('property_id') || $v->errors()->has('lease_id')) {
            return;
        }

        $leasePropertyId = Lease::query()->whereKey($leaseId)->value('property_id');
        if ((int) $leasePropertyId !== (int) $propertyId) {
            $v->errors()->add('lease_id', __('messaging.errors.lease_property_mismatch'));
        }
    }
}
