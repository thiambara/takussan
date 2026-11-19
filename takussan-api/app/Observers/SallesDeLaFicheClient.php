<?php

namespace App\Observers;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Lease;
use App\Services\Messaging\SallesDuFil;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2960 (ADR-0128 § 2) — une fiche client liée à un compte (ou détachée, ou liée à un autre) : les
 * salles des baux dont elle est le locataire et des réservations dont elle est le candidat se
 * resynchronisent. Le locataire sans compte n'était pas membre ; il y entre dès que sa fiche est liée.
 *
 * Écrivains relevés de `customers.user_id` (2026-11-18) : `CustomerService::linkUser` (invitation,
 * `InvitationService::lierLaFiche`, rattachement d'une fiche orpheline par `rattacherOuCreer`) — par le
 * modèle, donc vus ici. Une fiche CRÉÉE avec son compte n'a encore ni bail ni réservation. Seule
 * l'écriture de masse d'`AccountDeletionService` (`user_id` remis à nul) n'est pas vue : le compte est
 * effacé, et sa participation part avec lui.
 *
 * Après le COMMIT, comme `LeaseObserver`.
 */
class SallesDeLaFicheClient
{
    public function updated(Customer $customer): void
    {
        if (! $customer->wasChanged('user_id')) {
            return;
        }

        $id = (int) $customer->getKey();

        DB::afterCommit(function () use ($id): void {
            $salles = app(SallesDuFil::class);
            Lease::query()->where('tenant_id', $id)->orderBy('id')->each(fn (Lease $bail) => $salles->ouvrirApresLEcriture($bail));
            Booking::query()->where('customer_id', $id)->orderBy('id')->each(fn (Booking $resa) => $salles->ouvrirApresLEcriture($resa));
        });
    }
}
