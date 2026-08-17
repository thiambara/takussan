<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `DocumentController::authorizeAccess()` / `authorizeManage()` /
 * `authorizeUpload()` et de `DocumentVersionController::ensureCanActOn()` /
 * `checkDocumentableAccess()`.
 *
 * **Ces deux contrôleurs portaient la MÊME règle en double**, et le dépôt le savait : le docblock
 * de `checkDocumentableAccess()` disait « Mirrors DocumentController::authorizeUpload() without
 * the abort_unless ». *Un commentaire qui annonce une duplication ne la corrige pas — il la
 * documente, et il vieillit avec elle.* Sept branches polymorphes recopiées à l'identique : la
 * première divergence aurait été invisible.
 */
class DocumentPolicy extends BasePolicy
{
    /**
     * Lire un document : super-admin, celui qui l'a téléversé, ou quiconque a accès au modèle
     * auquel il est rattaché. Un document orphelin (`documentable` nul) est refusé.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Document) {
            return false;
        }

        if ($user->isSuperAdmin() || $model->uploaded_by === $user->id) {
            return true;
        }

        $documentable = $model->documentable;

        return $documentable !== null && $this->attachTo($user, $documentable);
    }

    /**
     * Administrer un document : super-admin ou celui qui l'a téléversé, **et personne d'autre** —
     * ni l'agence, ni le propriétaire du modèle rattaché.
     *
     * ⚠ C'est la règle la plus étroite du lot, et elle diverge de `view()` bien plus qu'ailleurs.
     * `DocumentVersionController` employait pourtant `ensureCanActOn()` — donc la règle de
     * `view()` — pour ses DEUX helpers, `authorizeAccess` comme `authorizeManage`. Les deux
     * contrôleurs ne s'accordaient donc pas sur ce que « gérer un document » veut dire ; la
     * migration conserve chaque appel sur l'ability qu'il exerçait réellement, elle ne les
     * réconcilie pas en douce.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Document) {
            return false;
        }

        return $user->isSuperAdmin() || $model->uploaded_by === $user->id;
    }

    /**
     * TCK-306 — reprise de `authorizeUpload()` : a-t-on accès au modèle porteur ?
     *
     * Sept branches, une par type de `documentable`. Elles ne se déduisent pas les unes des
     * autres : `Property` regarde `user_id`, `Lease` ajoute le locataire, `Customer` regarde DEUX
     * colonnes de propriété, `User` n'autorise que soi-même, et `Agency` compare l'agence à
     * l'identifiant du modèle et non à une colonne `agency_id`.
     */
    public function attachTo(User $user, Model $documentable): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($documentable instanceof Property) {
            return $documentable->user_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        }

        if ($documentable instanceof Lease) {
            return $documentable->landlord_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id)
                || ($documentable->tenant && $documentable->tenant->user_id === $user->id);
        }

        if ($documentable instanceof Booking) {
            $property = $documentable->property;

            return $documentable->created_by_id === $user->id
                || ($property && $property->user_id === $user->id)
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        }

        if ($documentable instanceof Customer) {
            return $documentable->added_by_id === $user->id
                || $documentable->user_id === $user->id
                || ($user->agency_id && $documentable->agency_id === $user->agency_id);
        }

        if ($documentable instanceof User) {
            return $documentable->id === $user->id;
        }

        if ($documentable instanceof Agency) {
            return $user->agency_id === $documentable->id;
        }

        if ($documentable instanceof Inventory) {
            return $documentable->conducted_by === $user->id
                || ($documentable->property && $documentable->property->user_id === $user->id)
                || ($user->agency_id && $documentable->property && $documentable->property->agency_id === $user->agency_id);
        }

        return false;
    }
}
