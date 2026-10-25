<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\BailleurDuBien;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-592 (verif-592, B2) — LA garde d'accès à une conversation : lecture, écriture, liste.
 *
 * La participation seule ne suffit plus pour un fil d'intervention (`maintenance_request_id`) : il
 * faut aussi `MaintenanceRequestPolicy::view`. Un prestataire en pause, en fin de collaboration ou
 * suspendu restait participant — il lisait les messages et les notes vocales du locataire et y
 * écrivait, alors que la fiche lui rendait 403. La contrainte du ticket : « collaboration finie ou
 * profil suspendu = plus d'accès, historique compris ». Juger par la policy de la demande couvre
 * ces trois cas, et ceux qui viendront, sans retirer personne du fil.
 *
 * Passe 2 (N1) : la participation n'est jamais lue seule. Tout lecteur qui part de
 * `conversation_participants` (recherche de messages, export des données, correspondants du
 * sélecteur de contacts) passe par {@see self::participatingQuery()} ; la recherche rendait le
 * texte et l'URL signée des notes vocales d'un fil que la fiche refusait.
 *
 * TCK-886 (P38.05, ADR-0068 § 2) — troisième branche, le **fil de prospect** : une directe qui
 * porte un `property_id`. Le prospect (`created_by`) y garde l'accès d'un participant ; tout autre
 * participant ne l'a que s'il est le contact principal ACTUEL du bien
 * ({@see PrimaryPropertyContact::for()}). Un agent retiré du bien, bloqué ou sorti de l'agence
 * perdait la collaboration mais gardait le fil, numéro du prospect compris.
 *
 * P191.01 (TCK-2019, version étroite décidée par le porteur) — quatrième branche, le **contexte** :
 * un fil rattaché à un bail (`lease_id`) ou à un bien (`property_id`) est refusé au participant qui
 * ne tient plus, dans l'agence de ce bail ou de ce bien, qu'un profil non actif (agent,
 * administrateur ou bailleur suspendu), et qui n'est partie ni au bail (bailleur, locataire) ni au
 * bien (propriétaire). Il n'en est pas retiré (`left_at` reste nul) : réactivé, il retrouve le fil.
 * TCK-2275 (P232.03) : « partie » se juge par `BailleurDuBien` ; l'agent qui a saisi le bien n'en
 * est pas le bailleur.
 */
class ConversationAccess
{
    public function allows(User $user, Conversation $conversation): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        // TCK-085 — `left_at != null` : l'utilisateur a quitté le groupe, il n'y a plus accès.
        $isParticipant = $conversation->participants()
            ->where('user_id', $user->id)
            ->wherePivotNull('left_at')
            ->exists();

        return $isParticipant && $this->branchesAllow($user, $conversation);
    }

    /**
     * Les branches propres à un type de fil, sans la participation : ce que filtre aussi
     * `NotifyNewMessageJob`, dont les destinataires sont déjà des participants actifs.
     */
    public function branchesAllow(User $user, Conversation $conversation): bool
    {
        return $this->maintenanceAllows($user, $conversation)
            && $this->prospectAllows($user, $conversation)
            && $this->contextAllows($user, $conversation);
    }

    /** La branche « contexte » seule (P191.01) : vrai pour tout fil sans bail ni bien. */
    public function contextAllows(User $user, Conversation $conversation): bool
    {
        if ($conversation->lease_id === null && $conversation->property_id === null) {
            return true;
        }

        $lease = $conversation->lease_id !== null
            ? DB::table('leases')->where('id', $conversation->lease_id)->first(['agency_id', 'landlord_id', 'tenant_id'])
            : null;
        $property = $conversation->property_id !== null
            ? DB::table('properties')->where('id', $conversation->property_id)->first(['agency_id', 'user_id'])
            : null;

        $agencyIds = array_values(array_filter([$lease?->agency_id, $property?->agency_id], fn ($id) => $id !== null));
        if (array_intersect($agencyIds, $this->inactiveOnlyAgencyIds($user)) === []) {
            return true;
        }

        $isTenant = $lease?->tenant_id !== null
            && DB::table('customers')->where('id', $lease->tenant_id)->where('user_id', $user->id)->exists();

        // TCK-2275 (P232.03 ; ADR-0031, amendement du 2026-10-25, D1) — « partie » au bail ou au bien
        // selon `BailleurDuBien` : l'agent suspendu qui les a saisis n'en est pas le bailleur.
        return BailleurDuBien::est($user, $lease?->landlord_id, $lease?->agency_id)
            || BailleurDuBien::est($user, $property?->user_id, $property?->agency_id)
            || $isTenant;
    }

    /**
     * Les agences où `$user` tient un profil d'agent, d'administrateur ou de bailleur, mais aucun
     * d'actif : un membre suspendu (`TeamMemberSuspensionService`), pas un membre actif qui garde
     * par ailleurs un profil ancien.
     *
     * @return list<int>
     */
    private function inactiveOnlyAgencyIds(User $user): array
    {
        $held = [];
        $active = [];
        foreach ([AgentProfile::class, AgencyAdminProfile::class, OwnerProfile::class] as $class) {
            $held = [...$held, ...$class::query()->where('user_id', $user->id)->pluck('agency_id')->all()];
            $active = [...$active, ...$class::query()->where('user_id', $user->id)->active()->pluck('agency_id')->all()];
        }

        return array_values(array_map('intval', array_diff(array_unique($held), $active)));
    }

    /** La branche « fil de prospect » seule : vrai pour tout fil qui n'en est pas un. */
    public function prospectAllows(User $user, Conversation $conversation): bool
    {
        if (! self::isProspectThread($conversation) || (int) $conversation->created_by === (int) $user->id) {
            return true;
        }

        $property = Property::withTrashed()->with(PrimaryPropertyContact::eagerLoads())->find($conversation->property_id);

        return $property !== null && PrimaryPropertyContact::for($property)?->id === $user->id;
    }

    /** ADR-0068 § 1 — une directe rattachée à un bien. */
    public static function isProspectThread(Conversation $conversation): bool
    {
        return $conversation->type === ConversationType::Direct && $conversation->property_id !== null;
    }

    /** La branche « intervention » seule : vrai pour tout fil qui n'en porte pas. */
    public function maintenanceAllows(User $user, Conversation $conversation): bool
    {
        if ($conversation->maintenance_request_id === null) {
            return true;
        }

        $request = $conversation->maintenanceRequest;

        return $request !== null && $user->can('view', $request);
    }

    /**
     * La même règle pour une liste : les fils d'intervention ne restent que si la demande est
     * visible (`MaintenanceRequest::scopeVisibleTo`, aligné sur `view`).
     *
     * @param  Builder<Conversation>  $query
     * @return Builder<Conversation>
     */
    public function constrainListing(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $query->where(fn (Builder $q) => $q
            ->whereNull('conversations.maintenance_request_id')
            ->orWhereIn('conversations.maintenance_request_id', MaintenanceRequest::query()->visibleTo($user)->select('maintenance_requests.id')));

        // TCK-886 — la branche « fil de prospect ». La règle du contact principal se juge en PHP
        // (`PrimaryPropertyContact`, une requête par agent examiné) : elle ne s'écrit pas en SQL.
        // On la juge donc sur les seuls biens des fils de prospect où `$user` répond, puis on
        // remet la liste des biens qu'il sert encore dans la requête.
        $answered = $this->answeredPropertyIds($user);

        $query->where(fn (Builder $q) => $q
            ->where('conversations.type', '!=', ConversationType::Direct->value)
            ->orWhereNull('conversations.property_id')
            ->orWhere('conversations.created_by', $user->id)
            ->orWhereIn('conversations.property_id', $answered));

        return $this->constrainContext($query, $user);
    }

    /**
     * P191.01 — la branche « contexte » pour une liste : hors des fils dont le bail ou le bien relève
     * d'une agence où `$user` n'a plus de profil actif, sauf s'il est partie au bail ou au bien. Sans
     * telle agence (le cas courant), la requête n'est pas touchée.
     *
     * @param  Builder<Conversation>  $query
     * @return Builder<Conversation>
     */
    private function constrainContext(Builder $query, User $user): Builder
    {
        $agencies = $this->inactiveOnlyAgencyIds($user);
        if ($agencies === []) {
            return $query;
        }

        $leasesInAgencies = DB::table('leases')->whereIn('agency_id', $agencies)->select('id');
        $propertiesInAgencies = DB::table('properties')->whereIn('agency_id', $agencies)->select('id');
        // TCK-2275 (P232.03) — partie selon `BailleurDuBien`, comme `contextAllows` ; supprimés
        // compris, comme la lecture de `DB::table` qu'elles remplacent.
        $leasesOfParty = Lease::withTrashed()->where(fn ($q) => $q
            ->where(fn ($b) => BailleurDuBien::restreindre($b, $user, 'landlord_id'))
            ->orWhereIn('tenant_id', DB::table('customers')->where('user_id', $user->id)->select('id')))
            ->select('id');
        $propertiesOfParty = BailleurDuBien::restreindre(Property::withTrashed(), $user)->select('id');

        return $query->whereNot(fn (Builder $q) => $q
            ->where(fn (Builder $c) => $c
                ->where(fn (Builder $l) => $l->whereNotNull('conversations.lease_id')->whereIn('conversations.lease_id', $leasesInAgencies))
                ->orWhere(fn (Builder $p) => $p->whereNotNull('conversations.property_id')->whereIn('conversations.property_id', $propertiesInAgencies)))
            ->where(fn (Builder $l) => $l->whereNull('conversations.lease_id')->orWhereNotIn('conversations.lease_id', $leasesOfParty))
            ->where(fn (Builder $p) => $p->whereNull('conversations.property_id')->orWhereNotIn('conversations.property_id', $propertiesOfParty)));
    }

    /**
     * Les biens dont `$user` est le contact principal, parmi ceux des fils de prospect où il est
     * participant sans en être le prospect.
     *
     * @return list<int>
     */
    private function answeredPropertyIds(User $user): array
    {
        $propertyIds = Conversation::query()
            ->where('type', ConversationType::Direct->value)
            ->whereNotNull('property_id')
            ->where('created_by', '!=', $user->id)
            ->whereIn('id', ConversationParticipant::query()->where('user_id', $user->id)->select('conversation_id'))
            ->distinct()
            ->pluck('property_id');

        if ($propertyIds->isEmpty()) {
            return [];
        }

        return Property::withTrashed()
            ->with(PrimaryPropertyContact::eagerLoads())
            ->whereKey($propertyIds->all())
            ->get()
            ->filter(fn (Property $property) => PrimaryPropertyContact::for($property)?->id === $user->id)
            ->map(fn (Property $property) => (int) $property->id)
            ->values()
            ->all();
    }

    /**
     * Les fils dont `$user` est participant ET qu'il peut lire, par la règle de la liste.
     *
     * @param  bool  $activeOnly  false : compte aussi les fils quittés (`left_at`), pour les
     *                            lecteurs qui les comptaient déjà (export, correspondants).
     * @return Builder<Conversation>
     */
    public function participatingQuery(User $user, bool $activeOnly = true): Builder
    {
        return $this->constrainListing(
            Conversation::query()->whereIn('conversations.id', ConversationParticipant::query()
                ->where('user_id', $user->id)
                ->when($activeOnly, fn ($q) => $q->whereNull('left_at'))
                ->select('conversation_id')),
            $user,
        );
    }
}
