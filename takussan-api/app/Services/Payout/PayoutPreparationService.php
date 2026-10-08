<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\PayoutMethod;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Carbon\CarbonInterface;

/**
 * TCK-594 (ADR-0039 §3) — préparer un reversement : choisir un bailleur et une période, puis LIRE
 * un calcul qu'on ne peut pas réécrire. Rien n'est écrit ici ; `POST /api/payouts` recalcule tout
 * depuis les identifiants des pièces que cette lecture rend.
 */
final class PayoutPreparationService
{
    public function __construct(private readonly PayoutCalculator $calculator) {}

    /**
     * @return array<string, mixed>
     */
    public function prepare(User $issuer, User $landlord, CarbonInterface $start, CarbonInterface $end, ?int $agencyId = null): array
    {
        // Comme `PayoutService::create` : le super-admin désigne l'agence ; pour tout autre, c'est celle
        // de son profil actif.
        $agencyId = $issuer->isSuperAdmin() && $agencyId !== null ? $agencyId : $issuer->agency_id;
        abort_code_if($agencyId === null, 403, 'payout.agency_required');
        $agency = Agency::query()->findOrFail($agencyId);

        abort_code_unless(
            $landlord->hasProfileAt((int) $agency->id, OwnerProfile::class)
            || $landlord->hasProfileAt((int) $agency->id, AgentProfile::class)
            || $landlord->hasProfileAt((int) $agency->id, AgencyAdminProfile::class),
            403,
            'payout.landlord_not_in_agency',
        );

        $computation = $this->calculator->compute(
            $agency,
            $this->calculator->leasePayments((int) $agency->id, (int) $landlord->id, $start, $end)->get(),
            $this->calculator->bookingPayments((int) $agency->id, (int) $landlord->id, $start, $end)->get(),
            $this->calculator->rechargeableBills((int) $agency->id, (int) $landlord->id)->get(),
        );

        $threshold = $agency->payout_approval_threshold;

        return array_merge($computation, [
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'period_start' => $start->toDateString(),
            'period_end' => $end->toDateString(),
            'requires_approval' => $threshold !== null && $computation['totals']['net'] >= (float) $threshold,
            'approval_threshold' => $threshold !== null ? (float) $threshold : null,
            // La forme masquée seule : l'agence ne lit jamais le numéro en clair (ADR-0039 §6).
            'payout_methods' => PayoutMethod::query()
                ->where('user_id', $landlord->id)
                ->orderByDesc('is_default')
                ->orderBy('id')
                ->get()
                ->map(fn (PayoutMethod $m) => [
                    'id' => $m->id,
                    'kind' => $m->kind?->value,
                    'masked_identifier' => $m->masked_identifier,
                    'is_default' => $m->is_default,
                    'verified' => $m->isVerified(),
                ])
                ->values()
                ->all(),
        ]);
    }
}
