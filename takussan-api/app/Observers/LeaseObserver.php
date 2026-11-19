<?php

namespace App\Observers;

use App\Models\Lease;
use App\Services\Messaging\SallesDuFil;
use Illuminate\Support\Facades\DB;

class LeaseObserver
{
    /**
     * TCK-2960 (ADR-0128 § 2) — les colonnes qui désignent les parties du bail : en changer une
     * resynchronise les membres de sa salle.
     */
    private const PARTIES = ['landlord_id', 'agent_id', 'tenant_id'];

    /** TCK-2960 — un bail créé, quel que soit son statut (brouillon compris), a sa salle. */
    public function created(Lease $lease): void
    {
        $this->ouvrirLaSalle($lease);
    }

    public function updated(Lease $lease): void
    {
        // TCK-2960 — AVANT le retour anticipé du compteur ci-dessous, qui ne regarde que `status`.
        if ($lease->wasChanged(self::PARTIES)) {
            $this->ouvrirLaSalle($lease);
        }

        if (! $lease->wasChanged('status') || $lease->agency_id === null) {
            return;
        }

        // P162.02 (TCK-1714) — le bail en préavis reste en cours. Le compteur d'une agence se
        // recalcule au prochain changement de statut d'un de ses baux.
        $count = Lease::where('agency_id', $lease->agency_id)
            ->whereIn('status', Lease::ONGOING_STATUSES)
            ->count();

        $lease->agency()->update(['active_leases_count' => $count]);
    }

    /**
     * TCK-2960 — après le COMMIT de l'écriture du bail (immédiat hors transaction), relu : la salle se
     * synchronise sur ce qui est écrit, jamais sur une copie en mémoire.
     */
    private function ouvrirLaSalle(Lease $lease): void
    {
        $id = (int) $lease->getKey();

        DB::afterCommit(function () use ($id): void {
            $bail = Lease::query()->find($id);
            if ($bail !== null) {
                app(SallesDuFil::class)->ouvrirApresLEcriture($bail);
            }
        });
    }
}
