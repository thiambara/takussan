<?php

namespace App\Services\Property;

use App\Exceptions\ApiError;
use App\Jobs\Property\RevalidatePublicPropertyPage;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * TCK-504 (ADR-0053 §3) — **la seule écriture qui déplace la marque d'agent principal.**
 *
 * L'endpoint `PUT …/collaborators/{c}/primary` l'appelle, et TCK-603 l'appellera depuis
 * `ResponsibleAgentAssigner` (réattribution unitaire et en lot, passation, réparation — ADR-0036).
 *
 * Garanties, dans l'ordre :
 *
 *  1. Transaction, et verrou de la LIGNE DU BIEN — jamais des lignes de collaborateurs ni d'un
 *     agrégat (pièges PostgreSQL n° 1 et n° 2). Deux désignations simultanées sur un même bien se
 *     sérialisent : la seconde voit la première validée et déplace la marque à son tour, au lieu
 *     d'échouer sur l'index unique. Appelé dans la transaction d'un appelant, c'est un point de
 *     sauvegarde, et le verrou déjà tenu est réentrant.
 *  2. La cible est RELUE sous le verrou : une ligne supprimée ou changée de rôle entre-temps est
 *     jugée sur son état réel.
 *  3. Refus, en {@see ApiError} (un appelant en lot l'attrape et lit `errorCode`) :
 *     `404 property.collaborator_not_found`, `422 property.primary_requires_agent`,
 *     `422 property.primary_not_eligible`.
 *  4. Cible déjà marquée : rien n'est écrit, ni journal ni invalidation (`changed = false`).
 *  5. L'ancienne ligne perd la marque PUIS la cible la reçoit — l'ordre inverse heurterait l'index.
 *     L'ancien principal garde sa ligne, son rôle et sa `commission_share`.
 *  6. Journal `activity('Property')`, évènement `property.primary_agent_designated`.
 *  7. Invalidation de la fiche publique, après validation de la transaction (ADR-0052 §2).
 *
 * Ce qu'il ne fait PAS : créer la ligne de la cible, changer son rôle, écrire `properties.user_id`.
 */
final class PrimaryAgentDesignator
{
    public const EVENT = 'property.primary_agent_designated';

    public function designate(Property $property, PropertyCollaborator $collaborator, ?User $actor): PrimaryAgentDesignation
    {
        return DB::transaction(function () use ($property, $collaborator, $actor): PrimaryAgentDesignation {
            $property = Property::withTrashed()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();
            $property->load(PrimaryPropertyContact::eagerLoads());

            /** @var PropertyCollaborator|null $target */
            $target = $property->collaborators->firstWhere('id', $collaborator->getKey());
            abort_code_if($target === null, 404, 'property.collaborator_not_found');
            abort_code_if($target->role !== CollaboratorRole::Agent, 422, 'property.primary_requires_agent');
            abort_code_unless(PrimaryPropertyContact::eligible($target->user, $property), 422, 'property.primary_not_eligible');

            /** @var PropertyCollaborator|null $previous */
            $previous = $property->collaborators->first(fn (PropertyCollaborator $c) => $c->is_primary === true);
            $previousContactUserId = PrimaryPropertyContact::for($property)?->id;

            if ($previous?->is($target)) {
                return new PrimaryAgentDesignation($target, $previous, $previousContactUserId, false);
            }

            // Par le constructeur de requêtes : aucun évènement de modèle, donc une seule
            // invalidation — la nôtre, plus bas — au lieu d'une par ligne écrite.
            DB::table('property_collaborators')
                ->where('property_id', $property->id)
                ->where('is_primary', true)
                ->update(['is_primary' => false, 'updated_at' => now()]);
            DB::table('property_collaborators')
                ->where('id', $target->id)
                ->update(['is_primary' => true, 'updated_at' => now()]);

            activity('Property')
                ->performedOn($property)
                ->causedBy($actor)
                ->withProperties([
                    'agency_id' => $property->agency_id,
                    'previous_collaborator_id' => $previous?->id,
                    'previous_user_id' => $previous?->user_id,
                    'previous_contact_user_id' => $previousContactUserId,
                    'collaborator_id' => $target->id,
                    'user_id' => $target->user_id,
                ])
                ->event(self::EVENT)
                ->log(self::EVENT);

            if (filled($property->slug)) {
                RevalidatePublicPropertyPage::dispatch([(string) $property->slug]);
            }

            return new PrimaryAgentDesignation(
                $target->refresh(),
                $previous?->refresh(),
                $previousContactUserId,
                true,
            );
        });
    }
}
