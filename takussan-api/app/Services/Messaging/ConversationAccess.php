<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\MaintenanceRequest;
use App\Models\User;
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

        return $isParticipant && $this->maintenanceAllows($user, $conversation);
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

        return $query->where(fn (Builder $q) => $q
            ->whereNull('conversations.maintenance_request_id')
            ->orWhereIn('conversations.maintenance_request_id', MaintenanceRequest::query()->visibleTo($user)->select('maintenance_requests.id')));
    }
}
