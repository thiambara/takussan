<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `CustomerController::authorizeAccess()`.
 *
 * `CustomerTagController` en portait une copie **au caractère près**, en `private` au lieu de
 * `protected` : deux fichiers, une seule règle, et rien qui garantissait qu'elles restent d'accord.
 *
 * TCK-587 (ADR-0031) — le « périmètre d'agence » était tout membre de l'agence : un bailleur
 * rattaché lisait, modifiait et supprimait **tout le CRM**, téléphones et pièces d'identité compris.
 * Le CRM de l'agence est désormais celui du personnel qui tient `crm.view_all` ; les autres n'ont
 * que les clients qu'ils ont ajoutés. `CustomerController::index` filtre par la même règle.
 */
class CustomerPolicy extends BasePolicy
{
    /** Lire un client : super-admin, celui qui l'a ajouté, ou le personnel tenant `crm.view_all`. */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Customer) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->added_by_id === $user->id
            || $this->seesWholeCrm($user, $model);
    }

    /**
     * `CustomerController` employait la MÊME règle pour lire et pour écrire — il n'avait pas de
     * `authorizeManage()`. La distinction n'est pas inventée ici : `update` délègue à `view`, ce
     * qui reproduit le comportement au lieu de le durcir en douce.
     */
    public function update(User $user, Model $model): bool
    {
        return $this->view($user, $model);
    }

    /**
     * TCK-587 — supprimer un client : son auteur s'il est PERSONNEL de l'agence, ou le personnel
     * tenant `crm.view_all`. `CustomerController::destroy` autorisait par `view` : tout membre de
     * l'agence, bailleur compris, supprimait un client qu'il n'avait pas ajouté.
     */
    public function delete(User $user, Model $model): bool
    {
        if (! $model instanceof Customer) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        // Un client hors de toute agence n'a que son auteur : aucun rôle ne peut porter de
        // capacité sur lui (même règle que le bien sans agence, `PropertyPolicy::agencyGesture`).
        if ($model->agency_id === null) {
            return $model->added_by_id === $user->id;
        }

        if (! $this->isStaffOf($user, $model->agency_id)) {
            return false;
        }

        return $model->added_by_id === $user->id
            || $user->can(Capability::CrmViewAll->value, $model);
    }

    /**
     * TCK-591 — créer une fiche est un geste du PERSONNEL de l'agence du profil actif (agent, admin
     * d'agence), ou du super-admin. `StoreCustomerRequest::authorize()` rendait `true` : un bailleur,
     * ou un compte sans profil, créait une fiche dans le CRM de l'agence de son profil actif.
     */
    public function create(User $user): bool
    {
        return $user->isSuperAdmin() || $user->staffAgencyId() !== null;
    }

    /**
     * TCK-591 §5 — rapprocher un prospect du portefeuille : lire le client ET être du personnel de
     * son agence (les biens privés de l'agence en sortent).
     */
    public function matchProperties(User $user, Customer $customer): bool
    {
        return $this->view($user, $customer) && $this->isStaffOf($user, $customer->agency_id);
    }

    private function seesWholeCrm(User $user, Customer $customer): bool
    {
        return $this->isStaffOf($user, $customer->agency_id)
            && $user->can(Capability::CrmViewAll->value, $customer);
    }
}
