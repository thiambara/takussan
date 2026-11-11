<?php

namespace App\Policies;

use App\Models\CommissionEntry;
use App\Models\Enums\Capability;
use App\Models\User;

/**
 * TCK-595 (ADR-0049 §3) — le grand livre est interne à l'agence.
 *
 * Lire : le bénéficiaire lit sa ligne ; qui détient `reports.view_agency` ou `payouts.approve` à
 * l'agence de la ligne, sous un profil actif de cette agence (contrat TCK-146), les lit toutes
 * (`CommissionEntry::readsWholeLedger`, TCK-2725). Marquer payée ou annuler :
 * `payouts.approve` à l'agence de la ligne, sous un profil actif de cette agence — le même pouvoir
 * que celui qui approuve un reversement. Le bénéficiaire ne solde pas sa propre ligne. Le
 * super-admin passe par `Gate::before`.
 */
class CommissionEntryPolicy
{
    /**
     * P217.05 (TCK-2237, porteur 2026-10-24) — `view` n'a PAS de lecteur : il n'existe pas de
     * route `GET /api/commissions/{id}`, et aucun code n'invoque `view` sur une ligne. Le relevé
     * (`GET /api/commissions`) et l'export lisent le périmètre de `CommissionEntry::scopeVisibleTo`,
     * qui exige le personnel de l'agence active : c'est lui qui fait foi. Le bénéficiaire sorti de
     * l'agence, admis ici sans condition, ne lit donc rien. Une route de lecture unitaire qui
     * appellerait cette règle devrait d'abord l'aligner sur `scopeVisibleTo`.
     */
    public function view(User $user, CommissionEntry $entry): bool
    {
        return $entry->beneficiary_id === $user->id
            || ($entry->agency !== null && CommissionEntry::readsWholeLedger($user, $entry->agency));
    }

    /**
     * TCK-2661 — lire le grand livre (relevé, point par bénéficiaire) : le personnel d'une agence. Le
     * PÉRIMÈTRE des lignes est celui de `CommissionEntry::scopeVisibleTo`. Même règle que l'en-tête
     * de `CommissionEntryController::index`.
     */
    public function viewAny(User $user): bool
    {
        return $user->staffAgencyId() !== null;
    }

    public function markPaid(User $user, CommissionEntry $entry): bool
    {
        return $entry->beneficiary_id !== $user->id
            && $this->actsAtAgencyWith($user, $entry, Capability::PayoutsApprove);
    }

    public function cancel(User $user, CommissionEntry $entry): bool
    {
        return $this->markPaid($user, $entry);
    }

    /**
     * TCK-2661 — solder en une fois les lignes dues d'un bénéficiaire : le même pouvoir que
     * {@see self::markPaid()}, jugé à l'agence du PROFIL ACTIF (les lignes, elles, doivent toutes en
     * être : le service le vérifie sous verrou). Le bénéficiaire ne solde pas ses propres lignes.
     */
    public function settle(User $user, int $beneficiaryId): bool
    {
        $agency = $user->activeProfile()?->agency;

        return $beneficiaryId !== $user->id
            && $agency !== null
            && $user->canActAt(Capability::PayoutsApprove, $agency);
    }

    private function actsAtAgencyWith(User $user, CommissionEntry $entry, Capability $capability): bool
    {
        return $user->activeProfile()?->agency_id === $entry->agency_id
            && $entry->agency !== null
            && $user->canActAt($capability, $entry->agency);
    }
}
