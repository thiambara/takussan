<?php

namespace App\Services\Property;

use App\Exceptions\ApiError;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Support\Facades\DB;

/**
 * TCK-603 (ADR-0036, ADR-0059 §1) — **changer l'agent responsable d'un bien, sans jamais toucher à
 * son propriétaire.**
 *
 * L'agent responsable est la marque de collaborateur principal de TCK-504 ; `properties.user_id`
 * reste le propriétaire. L'ancien `assignAgent` réécrivait `user_id` : le bailleur perdait son bien,
 * son tableau de bord le perdait, et l'agent devenait bailleur des baux à venir.
 *
 * Un seul service, appelé par la réattribution unitaire, le lot (`bulk-assign`), la passation et la
 * réparation. Dans l'ordre :
 *
 *  1. Transaction et verrou de la ligne du bien (piège PostgreSQL n° 2), réentrant dans celle de
 *     l'appelant ;
 *  2. la règle de cible de TCK-587, {@see self::cibleAdmise()} — la seule qui l'écrit ;
 *  3. la ligne de la cible, relue sous le verrou : créée en `agent` si elle manque ; `viewer` ou
 *     `manager` passe en `agent` (ADR-0036 §2) ; `co_owner` est refusée — un co-propriétaire porte un
 *     droit que la désignation ne doit pas effacer. Le rôle s'écrit sous le verrou du bien déjà
 *     tenu : c'est la condition d'O6 (verif-504), sans quoi le `CHECK` du schéma rendrait une 500 ;
 *  4. {@see PrimaryAgentDesignator::designate()}, qui juge l'éligibilité, déplace la marque, la
 *     journalise et invalide la fiche publique ;
 *  5. le journal `responsible_agent_changed`, sauf si la cible portait déjà la marque.
 *
 * Un refus est une `ApiError` : ce qui a été écrit avant (ligne créée, rôle changé) est annulé avec
 * la transaction du service.
 */
final class ResponsibleAgentAssigner
{
    public const EVENT = 'responsible_agent_changed';

    /** Les refus qui disent « cette cible ne peut pas répondre pour CE bien » — un lot les range en `invalid_target`. */
    public const TARGET_REFUSALS = [
        'user.not_in_active_agency',
        'property.responsible_agent_co_owner',
        'property.primary_not_eligible',
    ];

    public function __construct(
        private readonly PrimaryAgentDesignator $designator,
        private readonly MembershipCapabilityResolver $resolver,
    ) {}

    /**
     * @throws ApiError 422 user.not_in_active_agency
     *                  422 property.responsible_agent_co_owner
     *                  422 property.primary_not_eligible (désignation de TCK-504)
     */
    public function assign(Property $property, User $target, ?User $actor): ResponsibleAgentAssignment
    {
        return DB::transaction(function () use ($property, $target, $actor): ResponsibleAgentAssignment {
            $property = Property::withTrashed()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();

            abort_code_unless($this->cibleAdmise($property, $target, $actor), 422, 'user.not_in_active_agency');

            /** @var PropertyCollaborator|null $row */
            $row = PropertyCollaborator::query()
                ->where('property_id', $property->id)
                ->where('user_id', $target->id)
                ->first();

            $rowCreated = false;
            $previousRole = null;
            if ($row === null) {
                $row = PropertyCollaborator::query()->create([
                    'property_id' => $property->id,
                    'user_id' => $target->id,
                    'role' => CollaboratorRole::Agent,
                    'invited_at' => now(),
                ]);
                $rowCreated = true;
            } elseif ($row->role === CollaboratorRole::CoOwner) {
                abort_code(422, 'property.responsible_agent_co_owner');
            } elseif ($row->role !== CollaboratorRole::Agent) {
                $previousRole = $row->role?->value;
                $row->update(['role' => CollaboratorRole::Agent]);
            }

            $designation = $this->designator->designate($property, $row, $actor);

            if ($designation->changed) {
                activity('Property')
                    ->performedOn($property)
                    ->causedBy($actor)
                    ->withProperties([
                        'agency_id' => $property->agency_id,
                        'property_id' => $property->id,
                        'previous_user_id' => $designation->previousContactUserId,
                        'user_id' => $target->id,
                        'previous_role' => $previousRole,
                        'row_created' => $rowCreated,
                    ])
                    ->event(self::EVENT)
                    ->log(self::EVENT);
            }

            return new ResponsibleAgentAssignment($designation, $designation->changed, $rowCreated, $previousRole);
        });
    }

    /**
     * TCK-587 (Contraintes 9 de TCK-591) — **la règle de cible**, et la seule qui l'écrit : la cible
     * est personnel ACTIF (`isStaffAt`) de l'agence du bien, à défaut de celle du profil actif de
     * l'acteur. Sans agence déterminée, refus (ADR-0059 §1) : un particulier désignait n'importe quel
     * compte, dont le téléphone sortait par `GET …/contact`.
     */
    public function cibleAdmise(Property $property, User $target, ?User $actor): bool
    {
        $agencyId = $property->agency_id ?? $actor?->agency_id;

        return $agencyId !== null && $this->resolver->isStaffAt($target, (int) $agencyId);
    }
}
