<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-590 — qui lit et traite une demande de contact.
 *
 *   · son **destinataire** — le contact principal du bien, l'agent contacté, ou celui à qui elle
 *     a été attribuée ;
 *   · le **personnel de l'agence** de la demande qui détient `crm.view_all` : toute la boîte de
 *     l'agence. Sans elle, un agent ne lit que les siennes ;
 *   · l'attribution exige `crm.assign` dans l'agence.
 *
 * `crm.view_all` et `crm.assign` étaient accordées à l'agent et lues nulle part.
 *
 * {@see self::agencyScopeFor()} rend l'agence que l'appelant peut lire en entier : c'est la clause
 * d'`index`, pour que la liste et `view` ne puissent pas diverger.
 */
class PropertyContactLeadPolicy extends BasePolicy
{
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyContactLead) {
            return false;
        }

        return $user->isSuperAdmin()
            || ($model->recipient_user_id === $user->id && $this->resteDestinataire($user, $model))
            || $this->readsWholeAgency($user, $model->agency_id);
    }

    /**
     * Le destinataire ne lit la demande que s'il appartient ENCORE à son monde : demande sans
     * agence, personnel actif de l'agence de la demande, ou propriétaire du bien visé.
     *
     * Vérification adverse (M1) — `recipient_user_id` n'est pas réécrit quand un agent quitte
     * l'agence : il gardait sa boîte, lisait nom, téléphone et message, et convertissait la
     * demande en fiche client DE L'AGENCE qu'il avait quittée. AC18b fermait la fuite pour les
     * demandes neuves ; elle restait ouverte sur toutes celles déjà reçues.
     */
    private function resteDestinataire(User $user, PropertyContactLead $lead): bool
    {
        return $lead->agency_id === null
            || PersonnelDeLAgence::estPersonnel($user, $lead->agency_id)
            || ($lead->property_id !== null
                && Property::query()->whereKey($lead->property_id)->where('user_id', $user->id)->exists());
    }

    /**
     * La même règle, en clause d'`index` : les demandes qui sont adressées à l'appelant ET qu'il
     * peut encore lire.
     */
    public function scopeDestinataire(Builder $query, User $user): void
    {
        $agences = PersonnelDeLAgence::agencesOuPersonnel($user);

        $query->where('recipient_user_id', $user->id)
            ->where(fn (Builder $q) => $q->whereNull('agency_id')
                ->orWhereIn('agency_id', $agences)
                ->orWhereHas('property', fn (Builder $p) => $p->where('user_id', $user->id)));
    }

    /** Marquer traitée, convertir : qui peut la lire peut la traiter. */
    public function handle(User $user, Model $model): bool
    {
        return $this->view($user, $model);
    }

    public function convert(User $user, Model $model): bool
    {
        return $this->view($user, $model);
    }

    public function assign(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyContactLead || $model->agency_id === null) {
            return $user->isSuperAdmin();
        }

        $agency = Agency::query()->find($model->agency_id);

        return $user->isSuperAdmin()
            || ($agency !== null
                && PersonnelDeLAgence::estPersonnel($user, $agency->id)
                && $user->canActAt(Capability::CrmAssign, $agency));
    }

    /**
     * L'agence dont l'appelant lit TOUTE la boîte : celle de son profil actif, s'il y est personnel
     * et détient `crm.view_all`. Sinon `null` — il ne lit que les demandes qui lui sont adressées.
     */
    public function agencyScopeFor(User $user): ?int
    {
        $agencyId = $user->agency_id;

        return $this->readsWholeAgency($user, $agencyId) ? (int) $agencyId : null;
    }

    private function readsWholeAgency(User $user, mixed $agencyId): bool
    {
        if ($agencyId === null || ! PersonnelDeLAgence::estPersonnel($user, $agencyId)) {
            return false;
        }

        $agency = Agency::query()->find((int) $agencyId);

        return $agency !== null && $user->canActAt(Capability::CrmViewAll, $agency);
    }
}
