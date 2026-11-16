<?php

namespace App\Policies;

use App\Models\Booking;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `BookingController::authorizeAccess()` / `authorizeManage()`.
 *
 * Le `super_admin` est court-circuité globalement par `Gate::before` (`AppServiceProvider`) ; la
 * clause est conservée telle quelle dans chaque méthode pour que la policy reste juste lorsqu'elle
 * est appelée directement, hors de la Gate.
 */
class BookingPolicy extends BasePolicy
{
    /**
     * Lire une réservation : super-admin, celui qui l'a créée, le propriétaire du bien, le
     * personnel de l'agence (TCK-587 : plus tout membre), ou le CLIENT rattaché.
     *
     * ⚠ Deux clauses sont ici et **pas** dans `update()` : le créateur et le client. Un client
     * consulte sa réservation, il ne l'administre pas.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Booking) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            // P218.03 (TCK-2196) — le créateur encore membre de l'agence (ADR-0031, amendement du
            // 2026-10-24) ; le client du tunnel public garde la lecture par la branche du client.
            || $this->auteurEncoreMembre($user, $model->created_by_id, $model->agency_id)
            || $this->ownerOfProperty($user, $property)
            || $this->isStaffOf($user, $model->agency_id)
            || ($model->customer && $model->customer->user_id === $user->id);
    }

    /**
     * TCK-2579 (ADR-0102 §2, décision 9 (c)) — saisir une réservation AU NOM D'UN CLIENT : le
     * personnel de l'agence du bien, ou le super-admin. Pas de capacité nouvelle : c'est la règle
     * « personnel » que `BookingService::create` appliquait déjà (TCK-587), désormais lue ici par
     * le service ET par `StoreBookingRequest::authorize()` (le refus 403 précède la validation).
     * Un client, un bailleur, un prestataire, le personnel d'une autre agence : non.
     */
    public function recordForCustomer(User $user, Property $property): bool
    {
        return $user->isSuperAdmin() || $this->isStaffOf($user, $property->agency_id);
    }

    /** Administrer une réservation : super-admin, propriétaire du bien, ou périmètre d'agence. */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Booking) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $this->ownerOfProperty($user, $property)
            || $this->isStaffOf($user, $model->agency_id);
    }

    /**
     * TCK-587 — confirmer ou rejeter une réservation : le propriétaire du bien, ou le personnel de
     * l'agence tenant `bookings.validate`. Les deux gestes passaient par `update`, qui n'exigeait
     * aucune capacité : `bookings.validate` n'avait aucun lecteur.
     */
    public function validate(User $user, Booking $booking): bool
    {
        if ($user->isSuperAdmin() || $this->landlordOf($user, $booking)) {
            return true;
        }

        return $this->isStaffOf($user, $booking->agency_id)
            && $user->can(Capability::BookingsValidate->value, $booking);
    }

    /**
     * TCK-587 — annuler une réservation : son CLIENT, le propriétaire du bien, ou le personnel de
     * l'agence tenant `bookings.cancel`. `CancelBookingRequest` jugeait par `view` : tout membre de
     * l'agence, bailleur compris, annulait la réservation d'un autre.
     */
    public function cancel(User $user, Booking $booking): bool
    {
        if ($user->isSuperAdmin()
            || $this->landlordOf($user, $booking)
            || ($booking->customer && $booking->customer->user_id === $user->id)) {
            return true;
        }

        return $this->isStaffOf($user, $booking->agency_id)
            && $user->can(Capability::BookingsCancel->value, $booking);
    }

    /**
     * TCK-1494 (P116.04) — expirer une réservation à la main : le personnel de l'agence tenant
     * `bookings.cancel`, la capacité du geste voisin (annuler). Le contrôleur jugeait « être admin »,
     * sans capacité : un admin dont le rôle la retire expirait, un agent qui la porte était refusé.
     * Ni le bailleur ni le client : le geste est celui de l'agence (route sans appelant au front).
     */
    public function expire(User $user, Booking $booking): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return $this->isStaffOf($user, $booking->agency_id)
            && $user->can(Capability::BookingsCancel->value, $booking);
    }

    /**
     * TCK-2872 (ADR-0110 § 2) — déposer une pièce du dossier : le CLIENT de la réservation, ou le
     * personnel de l'agence du bien (actif). Plus étroit que `DocumentPolicy::attachTo`, qui admet
     * aussi le bailleur et l'auteur : le dossier se remplit par le candidat ou par l'agence.
     */
    public function uploadDossierPiece(User $user, Booking $booking): bool
    {
        return $user->isSuperAdmin()
            || $this->isStaffOf($user, $booking->agency_id)
            || ($booking->customer !== null && $booking->customer->user_id !== null
                && (int) $booking->customer->user_id === (int) $user->id);
    }

    /** TCK-2872 (ADR-0110 § 2) — « Demander » une pièce : le personnel de l'agence du bien seul. */
    public function requestDossierPiece(User $user, Booking $booking): bool
    {
        return $user->isSuperAdmin() || $this->isStaffOf($user, $booking->agency_id);
    }

    /**
     * TCK-2893 (ADR-0110 § 3) — rattacher ou retirer un garant : les auteurs du dossier, comme le
     * dépôt d'une pièce ({@see self::uploadDossierPiece()}) — le client de la réservation, qui le
     * déclare, ou le personnel de l'agence du bien. Ni le bailleur, ni un autre candidat.
     */
    public function manageGuarantors(User $user, Booking $booking): bool
    {
        return $this->uploadDossierPiece($user, $booking);
    }

    /**
     * TCK-2873 (ADR-0110 § 5) — contre-proposer un prix : le personnel de l'agence du bien tenant
     * la capacité de décision des réservations (`bookings.validate`), comme accepter ou refuser.
     * Le bailleur, que {@see self::validate()} admet aussi, ne négocie pas : le ticket nomme le
     * personnel seul.
     */
    public function proposeCounterOffer(User $user, Booking $booking): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return $this->isStaffOf($user, $booking->agency_id)
            && $user->can(Capability::BookingsValidate->value, $booking);
    }

    /** TCK-2873 (ADR-0110 § 5) — accepter ou décliner une contre-offre : le CLIENT de la réservation seul. */
    public function answerCounterOffer(User $user, Booking $booking): bool
    {
        return $booking->customer !== null && $booking->customer->user_id !== null
            && (int) $booking->customer->user_id === (int) $user->id;
    }

    /**
     * TCK-2893 (ADR-0110 § 4, ADR-0070 § 5) — le revenu déclaré EN CLAIR : un profil d'admin dans
     * l'agence de la réservation, comme la pièce du client (`CustomerPolicy::viewSensitive`). Une
     * réservation sans agence n'a pas de lecteur en clair ; le super-admin passe par `Gate::before`.
     */
    public function viewSensitive(User $user, Booking $booking): bool
    {
        return $booking->agency_id !== null && $user->isAgencyAdminAt((int) $booking->agency_id);
    }

    /**
     * TCK-596 (VERIF-596, hors diff fermé ici) — le propriétaire du bien confirme, refuse et annule,
     * sauf s'il est suspendu (`blocked`) dans l'agence de la réservation : la règle de 587
     * (`landlordWrites`) que le bail, l'état des lieux et le remboursement appliquaient déjà.
     *
     * TCK-1722 (P160.03) — « propriétaire » au sens de `bailleurEcrit` : l'agent qui a saisi le bien
     * confirme et annule au titre du personnel, sous `bookings.validate` et `bookings.cancel`.
     */
    private function landlordOf(User $user, Booking $booking): bool
    {
        $property = $booking->property;

        return $property !== null
            && $this->bailleurEcrit($user, $property->user_id, $booking->agency_id ?? $property->agency_id);
    }

    /**
     * TCK-1707 (P153.02) — `property.user_id` est le CRÉATEUR du bien : sur un bien d'agence, souvent
     * l'agent qui l'a saisi (vérification adverse M7). Il ne vaut propriétaire, pour LIRE, qu'au sens
     * de {@see BailleurDuBien}, DE TOUT STATUT : le bailleur suspendu reste partie et garde la lecture
     * (ADR-0031 §2) ; ses gestes, `bailleurEcrit` les lui refuse. L'agent retiré n'y entre plus.
     */
    private function ownerOfProperty(User $user, ?Property $property): bool
    {
        return $property !== null
            && BailleurDuBien::est($user, $property->user_id, $property->agency_id);
    }
}
