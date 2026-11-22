<?php

namespace App\Services\Commission;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\CommissionEntry;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CommissionCancelReason;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CommissionOrigin;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;
use Carbon\Carbon;
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
 * Le reliquat reste à l'agence, sans ligne. Chaque montant est arrondi à l'unité INFÉRIEURE de la
 * devise du bail (`Currency::decimalPlacesOf`, TCK-736) : la somme des lignes ne dépasse jamais la
 * base, quel que soit le nombre de parts.
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
        $scale = 10 ** Currency::decimalPlacesOf($lease->currency);
        foreach ($shares as $beneficiaryId => $share) {
            $amount = floor(round($base * $share / 100 * $scale, 6)) / $scale;
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

    /**
     * TCK-2661 — les moyens d'un paiement de commission : ceux des décaissements de l'agence
     * (`features.md` § 1.5), sans chèque ni carte. La référence est exigée hors espèces.
     */
    public const PAYMENT_METHODS = [
        PaymentMethod::Wave, PaymentMethod::OrangeMoney, PaymentMethod::FreeMoney,
        PaymentMethod::Cash, PaymentMethod::BankTransfer,
    ];

    /** TCK-2661 — au plus tant de lignes par solde groupé. */
    public const SETTLE_MAX = 100;

    /**
     * Marque la ligne versée : seule une ligne `due` change d'état, sous verrou de la ligne.
     *
     * TCK-2661 — `$details` : `paid_at` (date `Y-m-d` de Dakar, aujourd'hui à défaut), `payment_method`,
     * `payment_reference`. Le `FormRequest` les exige ; le service les accepte absents, pour ses
     * appelants internes (le seeder du grand livre). Le bénéficiaire est avisé par l'appelant du geste
     * ({@see self::notifyPaid()}), pas ici : un seeder ne fait partir aucune notification.
     *
     * @param  array{paid_at?: ?string, payment_method?: ?string, payment_reference?: ?string}  $details
     */
    public function markPaid(CommissionEntry $entry, User $by, array $details = []): CommissionEntry
    {
        // Sans détails (le seeder seul depuis TCK-2662, qui a retiré le corps vide du geste) : payée maintenant,
        // sans contrôle de date — le comportement d'avant TCK-2661.
        return $this->transition(
            $entry,
            $this->paidChanges($by, $details),
            $details === [] ? null : fn (CommissionEntry $locked) => $this->assertPaidAfterEarned($locked, $details),
        );
    }

    /**
     * Annule la ligne (résiliation, erreur de ventilation) : même règle que {@see self::markPaid()}.
     *
     * TCK-2661 — `$reason` : `reason_code` ({@see CommissionCancelReason}) et `reason` (texte libre,
     * exigé pour `other`), lisibles du bénéficiaire sur sa ligne.
     *
     * @param  array{reason_code?: ?string, reason?: ?string}  $reason
     */
    public function cancel(CommissionEntry $entry, User $by, array $reason = []): CommissionEntry
    {
        return $this->transition($entry, [
            'status' => CommissionEntryStatus::Cancelled,
            'cancelled_at' => now(),
            'cancelled_by_id' => $by->id,
            'cancel_reason_code' => $reason['reason_code'] ?? null,
            'cancel_reason' => self::blankToNull($reason['reason'] ?? null),
        ]);
    }

    /**
     * TCK-2661 — solde en une fois des lignes d'UN bénéficiaire, dans UNE agence : toutes ou aucune.
     *
     * Les lignes sont lues sous verrou, par id croissant (deux soldes concurrents se sérialisent sans
     * s'interbloquer). Une ligne introuvable, d'une autre agence ou d'un autre bénéficiaire rend une
     * seule 422 `commission.settle_mismatch`, sans dire laquelle ; une ligne non due, 422
     * `commission.not_due` ; une date de paiement antérieure au jour où une ligne est née, 422
     * `commission.paid_before_earned`. Tout est jugé AVANT la première écriture. L'appelant avise
     * le bénéficiaire une seule fois, pour le total ({@see self::notifyPaid()}).
     *
     * @param  list<int>  $entryIds
     * @param  array{paid_at?: ?string, payment_method?: ?string, payment_reference?: ?string}  $details
     * @param  ?int  $agencyId  l'agence du profil actif ; nulle (super-admin), les lignes n'en ont qu'une
     * @return list<CommissionEntry>
     */
    public function settle(?int $agencyId, int $beneficiaryId, array $entryIds, User $by, array $details): array
    {
        $ids = array_values(array_unique(array_map('intval', $entryIds)));

        return DB::transaction(function () use ($agencyId, $beneficiaryId, $ids, $by, $details): array {
            $rows = CommissionEntry::query()->whereKey($ids)->orderBy('id')->lockForUpdate()->get();
            $agency = $agencyId ?? $rows->first()?->agency_id;

            abort_code_if(
                $ids === []
                || $rows->count() !== count($ids)
                || $rows->contains(fn (CommissionEntry $row) => $row->agency_id !== $agency || $row->beneficiary_id !== $beneficiaryId),
                422,
                'commission.settle_mismatch',
            );
            abort_code_if($rows->contains(fn (CommissionEntry $row) => $row->status !== CommissionEntryStatus::Due), 422, 'commission.not_due');
            $rows->each(fn (CommissionEntry $row) => $this->assertPaidAfterEarned($row, $details));

            $changes = $this->paidChanges($by, $details);
            $rows->each(fn (CommissionEntry $row) => $row->update($changes));

            return $rows->all();
        });
    }

    /** @return array<string, mixed> */
    private function paidChanges(User $by, array $details): array
    {
        return [
            'status' => CommissionEntryStatus::Paid,
            'paid_at' => self::paidAt($details['paid_at'] ?? null),
            'paid_by_id' => $by->id,
            'payment_method' => $details['payment_method'] ?? null,
            'payment_reference' => self::blankToNull($details['payment_reference'] ?? null),
        ];
    }

    /**
     * La date saisie est un jour de Dakar. Aujourd'hui (ou rien) → l'instant du geste ; un jour passé
     * → le début de ce jour, comme la borne basse d'un filtre de date.
     */
    public static function paidAt(?string $date): Carbon
    {
        if ($date === null || $date === '' || $date === now(CommissionEntry::DATE_TIMEZONE)->toDateString()) {
            return now();
        }

        return CommissionEntry::startOfDakarDay($date);
    }

    /** Payée avant d'être due ? Jugé au JOUR de Dakar : une ligne née à 10 h se paie le jour même. */
    private function assertPaidAfterEarned(CommissionEntry $entry, array $details): void
    {
        $paidDay = self::paidAt($details['paid_at'] ?? null)->setTimezone(CommissionEntry::DATE_TIMEZONE)->toDateString();
        $earnedDay = $entry->earned_at?->copy()->setTimezone(CommissionEntry::DATE_TIMEZONE)->toDateString();

        abort_code_if($earnedDay !== null && $paidDay < $earnedDay, 422, 'commission.paid_before_earned');
    }

    /**
     * TCK-2661 — UNE notification `commission.paid` au bénéficiaire par geste (une ligne ou un solde
     * groupé), pour le total, appelée par le contrôleur APRÈS la transaction : un avis ne part jamais
     * pour un paiement annulé par un rollback. Hors du service des gestes parce que le seeder les
     * rejoue, et qu'un seeder écrit ses notifications sans les envoyer (`AppNotificationSeeder`).
     *
     * @param  list<CommissionEntry>  $entries
     */
    public function notifyPaid(array $entries): void
    {
        $first = $entries[0] ?? null;
        $beneficiary = $first !== null ? User::query()->find($first->beneficiary_id) : null;
        if ($beneficiary === null) {
            return;
        }

        $total = array_sum(array_map(fn (CommissionEntry $e) => (float) $e->amount, $entries));
        app(NotificationService::class)->send(
            $beneficiary,
            NotificationCode::CommissionPaid,
            ['count' => count($entries), 'amount' => NotificationRenderer::money(round($total, 2), $first->currency)],
            NotificationTarget::of('commissions')->forAgency($first->agency_id),
        );
    }

    private static function blankToNull(?string $value): ?string
    {
        return $value === null || trim($value) === '' ? null : $value;
    }

    /**
     * Le changement d'état passe par le modèle : `Auditable` le journalise sous `CommissionEntry`,
     * avec l'auteur du geste. Deux gestes simultanés se sérialisent sur la ligne. `$guard` juge la
     * ligne RELUE sous le verrou, avant l'écriture.
     *
     * @param  array<string, mixed>  $changes
     * @param  (callable(CommissionEntry): void)|null  $guard
     */
    private function transition(CommissionEntry $entry, array $changes, ?callable $guard = null): CommissionEntry
    {
        return DB::transaction(function () use ($entry, $changes, $guard): CommissionEntry {
            $locked = CommissionEntry::query()->whereKey($entry->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless($locked->status === CommissionEntryStatus::Due, 422, 'commission.not_due');
            if ($guard !== null) {
                $guard($locked);
            }
            $locked->update($changes);

            return $locked;
        });
    }
}
