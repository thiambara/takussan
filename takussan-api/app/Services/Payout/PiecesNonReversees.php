<?php

namespace App\Services\Payout;

use App\Models\User;

/**
 * TCK-2015 (P175.03), extrait par TCK-2753 (ADR-0108 § 3) — les pièces reversables qu'une agence
 * détient pour un bénéficiaire et qu'aucun reversement ne porte encore : celles que
 * {@see PayoutCalculator} rendrait à la préparation d'un reversement, sans période (loyers et acomptes
 * éligibles, hors acomptes retenus pour remboursement).
 *
 * Elles ne comptent que si le compte est bénéficiaire d'un reversement dans l'agence
 * ({@see BeneficiaireDuReversement}) : l'agent suspendu ou retiré qui a saisi un bien loué n'est plus
 * un créancier de l'agence, le bailleur de tout statut le reste (TCK-997, P232.05, P232.07).
 *
 * Deux lecteurs, une seule règle : l'effacement d'un compte (`AccountDeletionService`, les agences
 * qui lui doivent un reversement) et le départ d'un bailleur (`OwnerDeparture`, `unpaid_out_pieces`).
 */
final class PiecesNonReversees
{
    public function __construct(private readonly PayoutCalculator $calculator) {}

    /** Le nombre de pièces reversables non portées ; 0 hors bénéficiaire. */
    public function compte(User $beneficiaire, int $agencyId): int
    {
        if (! BeneficiaireDuReversement::est($beneficiaire, $agencyId)) {
            return 0;
        }

        // `reorder()` : PostgreSQL refuse un `ORDER BY` de colonne à côté d'un agrégat.
        return $this->calculator->leasePayments($agencyId, (int) $beneficiaire->id)->reorder()->count()
            + $this->calculator->bookingPayments($agencyId, (int) $beneficiaire->id)->reorder()->count();
    }

    /** Au moins une pièce ({@see self::compte()}), sans les compter. */
    public function existe(User $beneficiaire, int $agencyId): bool
    {
        return BeneficiaireDuReversement::est($beneficiaire, $agencyId)
            && ($this->calculator->leasePayments($agencyId, (int) $beneficiaire->id)->exists()
                || $this->calculator->bookingPayments($agencyId, (int) $beneficiaire->id)->exists());
    }
}
