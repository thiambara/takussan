<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Services\Crm\CustomerCommercialAttributes;

/**
 * TCK-2630 — ce que la colonne de contexte d'un fil affiche, jugé pour UN lecteur déjà admis par
 * {@see ConversationAccess::allows()} (la garde de `show`).
 *
 * Chaque bloc est jugé seul et vaut `null` quand il est absent ou interdit — jamais un 403 :
 *  - le bien du fil ;
 *  - le bail, si `LeasePolicy::view` ;
 *  - l'intervention, si `MaintenanceRequestPolicy::view` ;
 *  - la fiche CRM de l'autre participant d'une directe, au SEUL personnel de l'agence du fil.
 *    Pour tout autre lecteur (client, bailleur, prestataire, personnel d'une autre agence), le bloc
 *    n'existe pas : `customerShown` est faux et la ressource ne rend pas la clé.
 *    Dans ce bloc, le personnel lit toujours le NOM de son interlocuteur ; l'étape, le téléphone et
 *    le référent suivent la lecture de la fiche dans le CRM (`CustomerPolicy::view`,
 *    `customerReadable`) — un seul prédicat pour les trois, la colonne du fil ne montre pas plus
 *    que le CRM (TCK-2724, décision du porteur du 2026-11-11).
 *
 * L'agence du fil : celle du bail, sinon celle du bien — l'ordre de
 * `ConversationAccess::contextAllows()`. Une directe sans bail ni bien (l'agent écrit à un client)
 * n'en porte aucune : c'est alors l'agence où le lecteur est personnel, celle de son espace actif.
 * Le prédicat de personnel est celui des policies (`BasePolicy::isStaffOf`, `staffAgencyId()`), et
 * jamais une comparaison de `$user->agency_id` (check-agency-scope-clause).
 */
final class ConversationThreadContext
{
    public function __construct(
        public readonly ?Property $property,
        public readonly ?Lease $lease,
        public readonly ?MaintenanceRequest $maintenance,
        public readonly bool $customerShown,
        public readonly ?Customer $customer,
        public readonly bool $customerReadable,
        public readonly ?User $referent,
        /**
         * TCK-2748 — la relation de chaque participant au contexte du fil ({@see RelationsAuFil}),
         * jugée relation par relation sur ce que le lecteur peut lire.
         *
         * @var list<array{user_id: int, relation: string, category?: string|null}>
         */
        public readonly array $participants = [],
    ) {}

    public static function for(User $reader, Conversation $conversation): self
    {
        $conversation->loadMissing([
            'property.media',
            'lease.tenant',
            'lease.property',
            'maintenanceRequest.property',
            'maintenanceRequest.lease.tenant',
            'participants' => fn ($q) => $q->wherePivotNull('left_at'),
        ]);

        $lease = $conversation->lease;
        $maintenance = $conversation->maintenanceRequest;

        $agencyId = $lease?->agency_id ?? $conversation->property?->agency_id ?? $reader->staffAgencyId();
        $staffAgencyId = $reader->staffAgencyId();
        $customerShown = $agencyId !== null && $staffAgencyId !== null && $staffAgencyId === (int) $agencyId;

        $customer = $customerShown ? self::customerOf($reader, $conversation, (int) $agencyId) : null;
        $customerReadable = $customer !== null && $reader->can('view', $customer);

        $lease = $lease !== null && $reader->can('view', $lease) ? $lease : null;
        $maintenance = $maintenance !== null && $reader->can('view', $maintenance) ? $maintenance : null;

        return new self(
            property: $conversation->property,
            lease: $lease,
            maintenance: $maintenance,
            customerShown: $customerShown,
            customer: $customer,
            customerReadable: $customerReadable,
            referent: $customerReadable ? self::referentOf($customer) : null,
            participants: RelationsAuFil::pour($reader, $conversation, $lease, $maintenance),
        );
    }

    /**
     * La fiche de l'agence rattachée (`customers.user_id`) à l'AUTRE participant d'une directe — un
     * seul autre membre actuel, sinon aucune. Deux fiches pour le même compte dans la même agence
     * (rien ne l'interdit en base) : la plus ancienne, pour un choix stable.
     */
    private static function customerOf(User $reader, Conversation $conversation, int $agencyId): ?Customer
    {
        if ($conversation->type !== ConversationType::Direct) {
            return null;
        }

        $others = $conversation->participants->reject(fn (User $u) => (int) $u->id === (int) $reader->id);
        if ($others->count() !== 1) {
            return null;
        }

        return Customer::query()
            ->where('agency_id', $agencyId)
            ->where('user_id', $others->first()->id)
            ->orderBy('id')
            ->first();
    }

    /** Le référent : la relation `agent_client` principale et active, celle du CRM (TCK-2588). */
    private static function referentOf(Customer $customer): ?User
    {
        return UserCustomerRelationship::query()
            ->where('customer_id', $customer->id)
            ->tap(fn ($q) => CustomerCommercialAttributes::asReferent($q))
            ->with('user')
            ->orderBy('id')
            ->first()
            ?->user;
    }
}
