<?php

namespace App\Services\Commission;

use App\Models\CommissionEntry;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CommissionOrigin;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Support\Facades\DB;

/**
 * TCK-595 (ADR-0049 §3) — fait naître les lignes du grand livre d'un bail, à son activation.
 *
 * La base est `leases.commission_amount`. Elle se ventile entre :
 *  1. les collaborateurs `role=agent` du bien qui sont, AU MOMENT DE L'ACTIVATION, personnel de
 *     l'agence (`isStaffAt()`, le prédicat de `CollaboratorEligibleForProperty`) — `accepted_at`
 *     n'est PAS lu, rien ne l'écrit ;
 *  2. le négociateur (`leases.agent_id`), au taux de son `AgentProfile` actif dans l'agence,
 *     plafonné à `100 − Σ des parts servies`. Également collaborateur, il n'a qu'une ligne.
 *
 * Le reliquat reste à l'agence, sans ligne. Chaque montant est arrondi au centime INFÉRIEUR : la
 * somme des lignes ne dépasse jamais la base, quel que soit le nombre de parts.
 *
 * Idempotent par l'unicité `(lease_id, beneficiary_id)` et `insertOrIgnore` : une seconde émission
 * de `LeaseActivated` n'ajoute rien. On n'attrape jamais l'exception d'unicité (piège PostgreSQL
 * n° 1 : la transaction serait abandonnée).
 */
class CommissionLedgerService
{
    public function __construct(private readonly MembershipCapabilityResolver $resolver) {}

    /** @return int le nombre de lignes insérées */
    public function generateFor(Lease $lease): int
    {
        $base = (float) ($lease->commission_amount ?? 0);
        $agencyId = $lease->agency_id !== null ? (int) $lease->agency_id : null;
        // ADR-0049 §3 — un renouvellement ne crée aucune ligne. Depuis TCK-596, un enfant né
        // `pending_signature` émet `LeaseActivated` à sa signature : la règle se tient ici, sur le
        // bail, et non sur l'absence d'événement.
        if ($base <= 0 || $agencyId === null || $lease->renewed_from_lease_id !== null) {
            return 0;
        }

        $shares = [];
        $collaborators = PropertyCollaborator::query()
            ->where('property_id', $lease->property_id)
            ->where('role', CollaboratorRole::Agent->value)
            ->where('commission_share', '>', 0)
            ->with('user')
            ->orderBy('id')
            ->get();
        foreach ($collaborators as $collaborator) {
            if ($collaborator->user instanceof User && $this->resolver->isStaffAt($collaborator->user, $agencyId)) {
                $shares[(int) $collaborator->user_id] = (float) $collaborator->commission_share;
            }
        }

        $served = array_sum($shares);
        $breakdown = [];
        $negotiatorId = $lease->agent_id !== null ? (int) $lease->agent_id : null;
        if ($negotiatorId !== null) {
            $rate = (float) (AgentProfile::query()
                ->where('user_id', $negotiatorId)
                ->where('agency_id', $agencyId)
                ->where('status', AgentProfileStatus::Active->value)
                ->value('commission_rate') ?? 0);
            $capped = max(0.0, min($rate, 100.0 - $served));
            $breakdown = ['collaborator_share' => $shares[$negotiatorId] ?? 0.0, 'negotiator_rate' => $rate, 'negotiator_share' => $capped];
            $shares[$negotiatorId] = ($shares[$negotiatorId] ?? 0.0) + $capped;
        }

        $now = now();
        $earnedAt = $lease->signed_at ?? $now;
        $rows = [];
        foreach ($shares as $beneficiaryId => $share) {
            $amount = floor(round($base * $share, 6)) / 100;
            if ($share <= 0 || $amount <= 0) {
                continue;
            }
            $isNegotiator = $beneficiaryId === $negotiatorId;
            $rows[] = [
                'agency_id' => $agencyId,
                'lease_id' => $lease->id,
                'beneficiary_id' => $beneficiaryId,
                'origin' => ($isNegotiator ? CommissionOrigin::Negotiator : CommissionOrigin::Collaborator)->value,
                'base_amount' => $base,
                'share_percent' => round($share, 2),
                'amount' => $amount,
                'currency' => $lease->currency?->value ?? 'XOF',
                'status' => CommissionEntryStatus::Due->value,
                'earned_at' => $earnedAt,
                'metadata' => $isNegotiator ? json_encode($breakdown) : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        return $rows === [] ? 0 : CommissionEntry::query()->insertOrIgnore($rows);
    }

    /** Marque la ligne versée : seule une ligne `due` change d'état, sous verrou de la ligne. */
    public function markPaid(CommissionEntry $entry, User $by): CommissionEntry
    {
        return $this->settle($entry, ['status' => CommissionEntryStatus::Paid, 'paid_at' => now(), 'paid_by_id' => $by->id]);
    }

    /** Annule la ligne (résiliation, erreur de ventilation) : même règle que {@see self::markPaid()}. */
    public function cancel(CommissionEntry $entry, User $by): CommissionEntry
    {
        return $this->settle($entry, ['status' => CommissionEntryStatus::Cancelled, 'cancelled_at' => now(), 'cancelled_by_id' => $by->id]);
    }

    /**
     * Le changement d'état passe par le modèle : `Auditable` le journalise sous `CommissionEntry`,
     * avec l'auteur du geste. Deux gestes simultanés se sérialisent sur la ligne.
     *
     * @param  array<string, mixed>  $changes
     */
    private function settle(CommissionEntry $entry, array $changes): CommissionEntry
    {
        return DB::transaction(function () use ($entry, $changes): CommissionEntry {
            $locked = CommissionEntry::query()->whereKey($entry->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->status === CommissionEntryStatus::Due, 422, 'commission.not_due');
            $locked->update($changes);

            return $locked;
        });
    }
}
