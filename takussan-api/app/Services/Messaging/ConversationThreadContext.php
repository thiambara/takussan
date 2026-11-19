<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationType;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use App\Rules\PersonnelDeLAgence;
use App\Services\Crm\CustomerCommercialAttributes;
use App\Services\Pont\PontDesParticipants;
use Carbon\CarbonInterface;

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
         * TCK-2967 — chaque ligne porte `reads_team_notes`.
         *
         * @var list<array{user_id: int, relation: string, category?: string|null, reads_team_notes: bool}>
         */
        public readonly array $participants = [],
        /**
         * TCK-2858 — les faits de la fiche, sous la même règle que `stage` et `phone`
         * (`customerReadable`) : la dernière visite passée dans l'agence, la demande de contact liée
         * (si le lecteur peut la `view`), le premier contact et son canal.
         */
        public readonly ?PropertyVisit $lastVisit = null,
        public readonly ?PropertyContactLead $contactLead = null,
        public readonly ?CarbonInterface $firstContactAt = null,
        public readonly ?string $origin = null,
        /** TCK-2967 — l'appelant peut-il écrire une note d'équipe dans ce fil ? */
        public readonly bool $canWriteTeamNote = false,
        /**
         * TCK-2967 — les participants ACTIFS qui lisent les notes de ce fil (règle du tiers), ligne de relation
         * ou non ; vide pour un appelant qui ne les lit pas.
         *
         * @var list<int>
         */
        public readonly array $teamNoteReaderIds = [],
        /**
         * TCK-2987 (ADR-0130 § 6) — la fiabilité de chaque participant actif autre que l'appelant
         * (`{user_id: {kept, late}}`), ou `null` (la clé est alors ABSENTE) pour qui n'est pas personnel actif
         * de l'agence du fil ({@see FiabiliteDesEngagements}).
         *
         * @var array<int, array{kept: int, late: int}>|null
         */
        public readonly ?array $commitmentsRecords = null,
        /**
         * TCK-2981 (ADR-0132 § 3) — le pont, par participant actif (le lecteur exclu), au SEUL personnel actif de
         * l'agence du fil ({@see PontDesParticipants}) ; `null` pour tout autre lecteur.
         *
         * @var array<int, array<string, mixed>>|null
         */
        public readonly ?array $pont = null,
        /**
         * TCK-2981 (ADR-0132 § 2) — la fiche du locataire sans compte du bail de la salle ({@see PontDesParticipants::fiche()}) :
         * `false` hors du personnel (clé absente), `null` sans fiche à joindre.
         *
         * @var array<string, mixed>|false|null
         */
        public readonly array|false|null $pontFiche = false,
    ) {}

    /**
     * TCK-2858 — les statuts d'une visite qui a eu lieu, une fois son heure passée : terminée, ou
     * planifiée/confirmée et jamais close. Ni l'annulée ni l'absence (`no_show`) ne sont une visite.
     */
    public const LAST_VISIT_STATUSES = [VisitStatus::Completed, VisitStatus::Scheduled, VisitStatus::Confirmed];

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

        $facts = $customerReadable ? self::customerFacts($reader, $conversation, $customer, (int) $agencyId) : [];

        // TCK-2967 (pour TCK-2968) — la note d'équipe, jugée pour l'appelant (sous impersonation : la cible).
        // Écrire : la règle du refus 422 de `ConversationWriter` (agence du fil, personnel actif sous le
        // profil actif). Lire, pour chaque participant : la règle du tiers des mentions
        // (`EquipeDuFil::tiersLitLesNotes`, participant actif ET personnel de l'agence du fil), en lot — la
        // liste du personnel de l'agence, une requête. Rendue au seul lecteur des notes : pour tout autre,
        // `reads_team_notes` est faux partout (un client n'apprend rien des notes).
        $agenceDesNotes = EquipeDuFil::agence($conversation);
        $lecteursDesNotes = $agenceDesNotes !== null && EquipeDuFil::litLesNotes($reader, $conversation, $agenceDesNotes)
            ? FileDuFil::personnelDe($agenceDesNotes)
            : [];
        $participants = array_map(
            fn (array $ligne): array => [...$ligne, 'reads_team_notes' => in_array((int) $ligne['user_id'], $lecteursDesNotes, true)],
            RelationsAuFil::pour($reader, $conversation, $lease, $maintenance),
        );
        // Tout participant actif, qu'il ait une ligne de relation ou non (une ligne n'existe que pour une
        // relation lisible, TCK-2748) : la liste de ceux qui lisent les notes, même jugement.
        $lecteursParmiLesParticipants = $conversation->participants
            ->map(fn (User $u): int => (int) $u->id)
            ->filter(fn (int $id): bool => in_array($id, $lecteursDesNotes, true))
            ->sort()
            ->values()
            ->all();

        return new self(
            property: $conversation->property,
            lease: $lease,
            maintenance: $maintenance,
            customerShown: $customerShown,
            customer: $customer,
            customerReadable: $customerReadable,
            referent: $customerReadable ? self::referentOf($customer) : null,
            participants: $participants,
            canWriteTeamNote: $agenceDesNotes !== null && PersonnelDeLAgence::personnelActifDe($reader, $agenceDesNotes),
            teamNoteReaderIds: $lecteursParmiLesParticipants,
            // TCK-2987 — la fiabilité, au seul personnel actif de l'agence du fil ; une requête pour tous.
            commitmentsRecords: FiabiliteDesEngagements::pour($reader, $conversation, $agenceDesNotes, $conversation->participants),
            // TCK-2981 — le bloc `pont`, même règle de lecteur.
            pont: app(PontDesParticipants::class)->pour($reader, $conversation, $agenceDesNotes, $conversation->participants),
            pontFiche: app(PontDesParticipants::class)->fiche($reader, $conversation, $agenceDesNotes),
            lastVisit: $facts['lastVisit'] ?? null,
            contactLead: $facts['contactLead'] ?? null,
            firstContactAt: $facts['firstContactAt'] ?? null,
            origin: $facts['origin'] ?? null,
        );
    }

    /**
     * TCK-2858 — la dernière visite, la demande liée, le premier contact et son canal. Trois
     * requêtes, une fois par fil.
     *
     * - Dernière visite : la plus récente déjà passée, d'un statut {@see self::LAST_VISIT_STATUSES},
     *   sur un bien de l'agence du fil.
     * - Demande liée : celle qui a créé la fiche (`source_contact_lead_id`), sinon la dernière demande
     *   rattachée à la fiche (`customer_id`) sur le bien du fil ; rendue seulement si le lecteur peut
     *   la lire (`PropertyContactLeadPolicy::view`). Jamais un rapprochement par téléphone ou e-mail.
     * - Premier contact : le plus ancien de la création de la fiche et de la plus ancienne demande de
     *   la fiche (rattachée ou d'origine) ; le canal (`form`, `whatsapp`, `call`) seulement quand c'est
     *   la demande, `null` quand c'est la fiche (saisie à la main).
     *
     * @return array{lastVisit: ?PropertyVisit, contactLead: ?PropertyContactLead, firstContactAt: ?CarbonInterface, origin: ?string}
     */
    private static function customerFacts(User $reader, Conversation $conversation, Customer $customer, int $agencyId): array
    {
        $lastVisit = PropertyVisit::query()
            ->where('customer_id', $customer->id)
            ->whereIn('status', self::LAST_VISIT_STATUSES)
            ->where('scheduled_at', '<=', now())
            ->whereHas('property', fn ($q) => $q->where('agency_id', $agencyId))
            ->with('property:id,title')
            ->orderByDesc('scheduled_at')
            ->orderByDesc('id')
            ->first();

        $deLaFiche = fn ($q) => $q->where('customer_id', $customer->id)
            ->when($customer->source_contact_lead_id !== null, fn ($q) => $q->orWhere('id', $customer->source_contact_lead_id));

        $first = PropertyContactLead::query()
            ->where($deLaFiche)
            ->orderBy('created_at')
            ->orderBy('id')
            ->first(['id', 'channel', 'created_at']);

        $lead = $customer->source_contact_lead_id !== null
            ? PropertyContactLead::query()->with('property:id,title')->find($customer->source_contact_lead_id)
            : ($conversation->property_id === null ? null : PropertyContactLead::query()
                ->where('customer_id', $customer->id)
                ->where('property_id', $conversation->property_id)
                ->with('property:id,title')
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first());

        // Le plus ancien des deux : une fiche saisie à la main le 1er puis rattachée à une demande du 5
        // a eu son premier contact le 1er, sans canal.
        $parLaDemande = $first?->created_at !== null
            && ($customer->created_at === null || $first->created_at->lte($customer->created_at));

        return [
            'lastVisit' => $lastVisit,
            'contactLead' => $lead !== null && $reader->can('view', $lead) ? $lead : null,
            'firstContactAt' => $parLaDemande ? $first->created_at : $customer->created_at,
            'origin' => $parLaDemande ? $first->channel?->value : null,
        ];
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
