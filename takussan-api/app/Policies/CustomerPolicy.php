<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `CustomerController::authorizeAccess()`.
 *
 * `CustomerTagController` en portait une copie **au caractère près**, en `private` au lieu de
 * `protected` : deux fichiers, une seule règle, et rien qui garantissait qu'elles restent d'accord.
 */
class CustomerPolicy extends BasePolicy
{
    /** Lire un client : super-admin, celui qui l'a ajouté, ou le périmètre d'agence. */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Customer) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->added_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $model->agency_id);
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
     * TCK-591 — créer une fiche est un geste du PERSONNEL de l'agence du profil actif (agent, admin
     * d'agence), ou du super-admin. `StoreCustomerRequest::authorize()` rendait `true` : un bailleur,
     * ou un compte sans profil, créait une fiche dans le CRM de l'agence de son profil actif.
     */
    public function create(User $user): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        // TCK-587 — prédicat « personnel de l'agence » ; `$user->staffAgencyId() !== null` à sa fusion.
        $agencyId = $user->agency_id;

        return $agencyId !== null && ($user->isAgentAt((int) $agencyId) || $user->isAgencyAdminAt((int) $agencyId));
    }

    /**
     * TCK-591 §5 — rapprocher un prospect du portefeuille : lire le client ET être du personnel de
     * son agence (les biens privés de l'agence en sortent).
     *
     * TCK-587 — prédicat « personnel de l'agence » ; `isStaffAt()` à sa fusion.
     */
    public function matchProperties(User $user, Customer $customer): bool
    {
        $agencyId = $customer->agency_id;

        return $agencyId !== null
            && $this->view($user, $customer)
            && ($user->isAgentAt((int) $agencyId) || $user->isAgencyAdminAt((int) $agencyId));
    }
}
