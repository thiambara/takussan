<?php

namespace App\Services\Maintenance;

use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;

/**
 * TCK-592 — ADR-0037 : le plafond de travaux du bailleur, lu en un seul endroit.
 *
 * Au-delà du plafond, l'accord de l'équipe ne vaut pas accord du bailleur. Il s'appliquait au devis
 * (`awaiting_owner`) ; `actual_cost` le contournait (verif-592, M1) : un devis de 40 000 approuvé
 * par l'agent sous un plafond de 50 000, puis un coût réel de 750 000 déclaré sans que le bailleur
 * ait rien dit. TCK-594 (facture) lit ce chiffre.
 */
class OwnerApprovalThreshold
{
    /** Le plafond du couple (bailleur du bien, agence du bien). Nul : pas d'accord requis. */
    public function of(MaintenanceRequest $mr): ?string
    {
        $property = $mr->property;
        if ($property === null || $property->agency_id === null || $property->user_id === null) {
            return null;
        }

        $threshold = OwnerProfile::query()
            ->where('user_id', $property->user_id)
            ->where('agency_id', $property->agency_id)
            ->value('works_approval_threshold');

        return $threshold === null ? null : (string) $threshold;
    }

    public function isLandlord(MaintenanceRequest $mr, int $userId): bool
    {
        return $mr->property !== null && (int) $mr->property->user_id === $userId;
    }

    /** Le montant dépasse-t-il strictement le plafond ? Égal au plafond : non. */
    public function exceeds(MaintenanceRequest $mr, mixed $amount): bool
    {
        $threshold = $this->of($mr);

        return $threshold !== null && $amount !== null
            && bccomp((string) $amount, $threshold, 2) === 1;
    }

    /**
     * `actual_cost` écrit par un autre que le bailleur : refusé (422 codé) s'il dépasse le plafond
     * ET ce que le bailleur a lui-même approuvé. Le bailleur l'écrit, comme il tranche un devis au-delà
     * du plafond — c'est son accord qui s'applique.
     */
    public function assertActualCostAgreed(MaintenanceRequest $mr, mixed $amount, int $actorId): void
    {
        if ($amount === null || $this->isLandlord($mr, $actorId) || ! $this->exceeds($mr, $amount)) {
            return;
        }

        // verif-592 passe 3 (N8) — une DÉCISION du bailleur n'est pas un accord : son refus pose
        // aussi `quote_decision_by_id`, et valait accord pour le montant même qu'il avait refusé.
        $agreedByOwner = $mr->quote_amount !== null
            && $mr->quote_decision_at !== null
            && $mr->quote_rejection_reason === null
            && $mr->quote_decision_by_id !== null
            && $this->isLandlord($mr, (int) $mr->quote_decision_by_id)
            && bccomp((string) $amount, (string) $mr->quote_amount, 2) <= 0;

        abort_code_unless($agreedByOwner, 422, 'maintenance.actual_cost_needs_owner');
    }
}
