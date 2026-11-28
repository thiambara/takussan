<?php

namespace App\Services\Lecture;

use App\Models\Invoice;
use App\Models\User;
use App\Policies\BasePolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-3006 (ADR-0138) — qui peut lire une facture, pour la liste (`GET /api/invoices`) et pour la
 * fiche (`InvoicePolicy::view`). Les deux faces sont écrites côte à côte, branche par branche ;
 * `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. l'émetteur, tant que la facture est hors agence ou qu'il est encore membre de son agence
 *     (P218.03, TCK-2196 — ADR-0031, amendement du 2026-10-24) ;
 *  2. le client facturé (le compte de la fiche client) ;
 *  3. le personnel de l'agence de la facture, celle de son profil actif (TCK-587).
 */
final class FacturesLisibles
{
    /**
     * @param  Builder<Invoice>  $query
     * @return Builder<Invoice>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $memberAgencyIds = app(MembershipCapabilityResolver::class)->memberAgencyIds($user);
        $staffAgencyId = $user->staffAgencyId();
        $agence = $query->qualifyColumn('agency_id');

        return $query->where(function (Builder $q) use ($user, $memberAgencyIds, $staffAgencyId, $agence) {
            // 1.
            $q->where(fn (Builder $a) => $a->where($q->qualifyColumn('issued_by_id'), $user->id)
                ->where(fn (Builder $m) => $m->whereNull($agence)->orWhereIn($agence, $memberAgencyIds)))
                // 2.
                ->orWhereHas('customer', fn (Builder $c) => $c->where('user_id', $user->id));
            // 3.
            if ($staffAgencyId !== null) {
                $q->orWhere($agence, $staffAgencyId);
            }
        });
    }

    public static function peut(User $user, Invoice $invoice): bool
    {
        return $user->isSuperAdmin()
            // 1.
            || BasePolicy::auteurEncoreMembre($user, $invoice->issued_by_id, $invoice->agency_id)
            // 2.
            || ($invoice->customer !== null && (int) $invoice->customer->user_id === (int) $user->id)
            // 3.
            || AgenceDuLecteur::personnel($user, $invoice->agency_id);
    }
}
