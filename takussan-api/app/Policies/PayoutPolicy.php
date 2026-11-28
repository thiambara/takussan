<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Payout;
use App\Models\User;
use App\Services\Lecture\ReversementsLisibles;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `PayoutController::authorizeAccess()` / `authorizeManage()`.
 */
class PayoutPolicy extends BasePolicy
{
    /**
     * TCK-528 — émettre un reversement exige `payouts.create` sur l'agence du profil actif.
     *
     * La capacité n'était accordée qu'à `agency_admin` (par `Capability::agencyAssignable()`) et
     * lue nulle part : `PayoutService::create()` acceptait tout utilisateur ayant une agence.
     */
    protected function createCapability(): ?Capability
    {
        return Capability::PayoutsCreate;
    }

    /**
     * Lire un versement : la règle de {@see ReversementsLisibles}, que la liste applique aussi
     * (TCK-3006, ADR-0138).
     */
    public function view(User $user, Model $model): bool
    {
        return $model instanceof Payout && ReversementsLisibles::peut($user, $model);
    }

    /**
     * Administrer un versement (`mark-processed`, `mark-failed`, `cancel`) : jamais le
     * bénéficiaire ; sinon l'émetteur s'il est personnel de l'agence, ou le personnel tenant
     * `payouts.create`.
     *
     * ⚠ TCK-587 (ADR-0031 §2) — **le refus du bénéficiaire est en TÊTE, et il vaut même s'il est
     * aussi personnel.** Ce docblock affirmait déjà « le bénéficiaire n'est PAS ici », mais la
     * clause d'agence était vraie pour lui : un bailleur rattaché marquait « traité » son propre
     * versement. Dans une agence `individual`, l'hôte — admin et bailleur à la fois — ne marque pas
     * non plus ses propres versements : un versement à soi-même n'y a pas d'objet.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Payout) {
            return false;
        }

        if ($model->landlord_id === $user->id) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        if (! $this->isStaffOf($user, $model->agency_id)) {
            return false;
        }

        return $model->issued_by_id === $user->id
            || $user->can(Capability::PayoutsCreate->value, $model);
    }

    /**
     * TCK-594 (ADR-0039 §4) — approuver un reversement en attente : `payouts.approve` à l'agence du
     * REVERSEMENT (pas à celle du profil actif), personnel de cette agence, et jamais le bénéficiaire.
     *
     * La règle « l'approbateur n'est pas le préparateur » n'est pas ici : elle vit dans
     * `SegregationOfDuties`, que le service appelle — le super-admin, que `Gate::before` laisse passer,
     * y est soumis comme les autres.
     */
    public function approve(User $user, Model $model): bool
    {
        if (! $model instanceof Payout) {
            return false;
        }

        if ($model->beneficiaryUserId() === $user->id) {
            return false;
        }

        return $this->isStaffOf($user, $model->agency_id)
            && $user->can(Capability::PayoutsApprove->value, $model);
    }
}
