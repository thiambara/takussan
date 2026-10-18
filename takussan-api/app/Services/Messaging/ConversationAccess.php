<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationType;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Eloquent\Builder;

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
            && $this->prospectAllows($user, $conversation);
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

        return $query->where(fn (Builder $q) => $q
            ->where('conversations.type', '!=', ConversationType::Direct->value)
            ->orWhereNull('conversations.property_id')
            ->orWhere('conversations.created_by', $user->id)
            ->orWhereIn('conversations.property_id', $answered));
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
