<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;

/**
 * TCK-594 (ADR-0039 §4) — LA règle du seuil des quatre yeux d'agence. Création, préparation et
 * caution rendue l'empruntent ; aucune ne la réécrit.
 *
 * Le seuil ne se juge pas reversement par reversement : fractionner 120 000 en deux fois 60 000
 * passait sous un seuil de 100 000 (VERIF-594 M-1). Il se juge sur le net, AJOUTÉ aux nets non
 * approuvés déjà émis vers le même bénéficiaire, dans la même agence, sur 27 jours glissants. Un
 * reversement approuvé ne compte plus : l'approbation l'a couvert. Un reversement payé sans
 * approbation compte : c'est l'argent sorti d'une seule main.
 *
 * Le bénéficiaire est l'utilisateur de `landlord_id` pour un bailleur ou un prestataire, et le
 * locataire du bail (`leases.tenant_id`) pour une caution rendue.
 *
 * ⚠ L'appelant tient le verrou de la LIGNE AGENCE : deux créations concurrentes vers le même
 * bénéficiaire lisent sinon chacune un cumul qui ignore l'autre.
 */
final class PayoutApprovalRule
{
    /**
     * VERIF-594 passe 2, N-3 — 27 et non 30 : une cadence mensuelle (28 jours au moins, février
     * compris) ne se cumule plus avec elle-même, quand un fractionnement DANS le mois reste pris. La
     * seule valeur de la fenêtre : l'écran la lit dans la préparation (`approval_window_days`).
     */
    public const WINDOW_DAYS = 27;

    public function requiresApproval(Agency $agency, float $net, PayeeRole $role, ?int $beneficiaryKey): bool
    {
        // ADR-0039 §4 — pas de seuil par défaut (porteur, 2026-10-06) : `null` ⇒ jamais d'attente.
        $threshold = $agency->payout_approval_threshold;
        if ($threshold === null) {
            return false;
        }

        return $net + $this->unapprovedRecentNet($agency, $role, $beneficiaryKey) >= (float) $threshold;
    }

    public function unapprovedRecentNet(Agency $agency, PayeeRole $role, ?int $beneficiaryKey): float
    {
        if ($beneficiaryKey === null) {
            return 0.0;
        }

        $query = Payout::query()
            ->where('agency_id', $agency->id)
            ->where('payee_role', $role->value)
            ->whereNull('approved_by_id')
            ->whereIn('status', array_map(fn (PayoutStatus $s) => $s->value, [
                PayoutStatus::Pending, PayoutStatus::Scheduled, PayoutStatus::Processing, PayoutStatus::Completed,
            ]))
            ->where('created_at', '>=', now()->subDays(self::WINDOW_DAYS));

        $role === PayeeRole::Tenant
            ? $query->whereHas('lease', fn ($q) => $q->where('tenant_id', $beneficiaryKey))
            : $query->where('landlord_id', $beneficiaryKey);

        return (float) $query->sum('net_amount');
    }
}
