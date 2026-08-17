<?php

namespace App\Policies;

use App\Models\Invoice;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `InvoiceController::authorizeAccess()` / `authorizeManage()`.
 *
 * `PaymentGatewayController::authorizeManage()` portait une **troisième** copie pour la branche
 * `Invoice` de son test polymorphe, sans la clause `isSuperAdmin()` (elle était sortie en tête de
 * méthode) : même règle, écrite deux fois, dans deux fichiers.
 */
class InvoicePolicy extends BasePolicy
{
    /** Lire une facture : super-admin, émetteur, périmètre d'agence, ou le CLIENT facturé. */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Invoice) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $model->agency_id)
            || ($model->customer && $model->customer->user_id === $user->id);
    }

    /** Administrer une facture : super-admin, émetteur, ou périmètre d'agence — pas le client. */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Invoice) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $model->agency_id);
    }
}
