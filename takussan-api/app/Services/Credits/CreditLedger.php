<?php

namespace App\Services\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Enums\CreditMovementType;
use App\Models\PropertyBoost;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * TCK-633 lot F (ADR-0061 §1, §2) — le SEUL écrivain de `credit_lots` et `credit_movements`.
 *
 * Toute écriture qui débite passe par le même point de sérialisation : la ligne `agencies` de
 * l'espace, verrouillée AVANT la lecture des lots (piège PostgreSQL n°2 : on ne verrouille pas un
 * agrégat, on verrouille le parent). Les crédits sont des ENTIERS : jamais ×100.
 */
final class CreditLedger
{
    public function balance(Agency|int $agency): int
    {
        $id = $agency instanceof Agency ? $agency->getKey() : $agency;

        return (int) CreditLot::query()->where('agency_id', $id)->spendable()->sum('remaining_amount');
    }

    public function grant(
        Agency $agency,
        CreditLotOrigin $origin,
        int $amount,
        ?CarbonInterface $expiresAt,
        ?User $actor = null,
        ?string $reason = null,
        ?PropertyBoost $boost = null,
    ): CreditLot {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Un lot porte un montant strictement positif.');
        }
        if ($origin === CreditLotOrigin::Purchase) {
            throw new InvalidArgumentException('L’achat de crédits est la phase 2 (ADR-0061 §11).');
        }

        return DB::transaction(function () use ($agency, $origin, $amount, $expiresAt, $actor, $reason, $boost): CreditLot {
            $lot = CreditLot::query()->create([
                'agency_id' => $agency->getKey(),
                'origin' => $origin,
                'initial_amount' => $amount,
                'remaining_amount' => $amount,
                'expires_at' => $expiresAt,
                'granted_by_id' => $actor?->getKey(),
                'reason' => $reason,
            ]);

            CreditMovement::record([
                'agency_id' => $agency->getKey(),
                'credit_lot_id' => $lot->getKey(),
                'type' => $origin === CreditLotOrigin::Refund ? CreditMovementType::Refund : CreditMovementType::Grant,
                'amount' => $amount,
                'property_boost_id' => $boost?->getKey(),
                'actor_id' => $actor?->getKey(),
                'reason' => $reason,
            ]);

            return $lot;
        });
    }

    /**
     * Débite `$amount` crédits dans l'ordre de consommation, un mouvement par lot entamé.
     *
     * @return list<CreditMovement>
     *
     * @throws InsufficientCredits
     */
    public function spend(
        Agency $agency,
        int $amount,
        CreditMovementType $type = CreditMovementType::Spend,
        ?PropertyBoost $boost = null,
        ?User $actor = null,
        ?string $reason = null,
    ): array {
        if ($amount <= 0) {
            throw new InvalidArgumentException('Une dépense porte un montant strictement positif.');
        }
        if (! in_array($type, [CreditMovementType::Spend, CreditMovementType::AdminDebit], true)) {
            throw new InvalidArgumentException("Type de débit invalide : {$type->value}.");
        }

        return DB::transaction(function () use ($agency, $amount, $type, $boost, $actor, $reason): array {
            // 1. Le point de sérialisation : la ligne PARENT.
            Agency::query()->whereKey($agency->getKey())->lockForUpdate()->firstOrFail();

            // 2. Les lots se lisent APRÈS le verrou : lus avant, ils seraient périmés pour qui attendait.
            $lots = CreditLot::query()
                ->where('agency_id', $agency->getKey())
                ->spendable()
                ->inConsumptionOrder()
                ->get();

            $balance = (int) $lots->sum('remaining_amount');
            if ($balance < $amount) {
                throw new InsufficientCredits($amount, $balance);
            }

            $left = $amount;
            $movements = [];
            foreach ($lots as $lot) {
                if ($left === 0) {
                    break;
                }
                $take = min($left, $lot->remaining_amount);
                $lot->forceFill(['remaining_amount' => $lot->remaining_amount - $take])->save();
                $movements[] = CreditMovement::record([
                    'agency_id' => $agency->getKey(),
                    'credit_lot_id' => $lot->getKey(),
                    'type' => $type,
                    'amount' => -$take,
                    'property_boost_id' => $boost?->getKey(),
                    'actor_id' => $actor?->getKey(),
                    'reason' => $reason,
                ]);
                $left -= $take;
            }

            return $movements;
        });
    }

    /**
     * ADR-0061 §4, §8 — rend `$amount` crédits d'un boost : calcule la répartition
     * ({@see refundPlan()}) puis écrit un lot `refund` par part ({@see applyRefund()}).
     */
    public function refund(PropertyBoost $boost, int $amount, ?User $actor = null, ?string $reason = null): RefundPlan
    {
        return DB::transaction(function () use ($boost, $amount, $actor, $reason): RefundPlan {
            $plan = $this->refundPlan($boost, $amount);
            $this->applyRefund($boost, $plan, $actor, $reason);

            return $plan;
        });
    }

    /**
     * ADR-0061 §4 — le remboursement se répartit PAR LOT D'ORIGINE, au prorata de ce que chaque lot
     * a fourni au boost. Chaque part hérite de l'expiration de SON lot (nulle pour un lot acheté) :
     * un remboursement ne prolonge jamais un crédit offert et ne fait jamais expirer un crédit
     * acheté. Une part dont le lot a déjà expiré n'est pas rendue (`expired`).
     *
     * Arrondi : le prorata est d'abord borné à ce que le boost a payé, puis réparti par plus forts
     * restes — la somme des parts vaut exactement ce prorata borné, et aucune part ne dépasse ce
     * que son lot a fourni. Lecture seule : rien n'est écrit.
     */
    public function refundPlan(PropertyBoost $boost, int $amount): RefundPlan
    {
        if ($amount <= 0) {
            return new RefundPlan;
        }

        $paid = DB::table('credit_movements')
            ->join('credit_lots', 'credit_lots.id', '=', 'credit_movements.credit_lot_id')
            ->where('credit_movements.property_boost_id', $boost->getKey())
            ->where('credit_movements.type', CreditMovementType::Spend->value)
            ->groupBy('credit_movements.credit_lot_id', 'credit_lots.expires_at')
            ->orderBy('credit_movements.credit_lot_id')
            ->get([
                'credit_movements.credit_lot_id as lot_id',
                'credit_lots.expires_at',
                DB::raw('-SUM(credit_movements.amount) as paid'),
            ]);

        $total = (int) $paid->sum('paid');
        $target = min($amount, $total);
        if ($target <= 0) {
            return new RefundPlan;
        }

        // Plus forts restes : la part entière d'abord, puis une unité aux plus grands restes
        // (à reste égal, au lot le plus ancien) jusqu'à atteindre le prorata.
        $parts = [];
        foreach ($paid as $row) {
            $product = $target * (int) $row->paid;
            $parts[] = ['lot_id' => (int) $row->lot_id, 'expires_at' => $row->expires_at, 'amount' => intdiv($product, $total), 'rest' => $product % $total];
        }
        $left = $target - array_sum(array_column($parts, 'amount'));
        $order = array_keys($parts);
        usort($order, fn (int $a, int $b) => [$parts[$b]['rest'], $parts[$a]['lot_id']] <=> [$parts[$a]['rest'], $parts[$b]['lot_id']]);
        foreach (array_slice($order, 0, $left) as $i) {
            $parts[$i]['amount']++;
        }

        $refunded = 0;
        $expired = 0;
        $shares = [];
        foreach ($parts as $part) {
            if ($part['amount'] <= 0) {
                continue;
            }
            $expiresAt = $part['expires_at'] === null ? null : Carbon::parse($part['expires_at']);
            if ($expiresAt !== null && ! $expiresAt->isFuture()) {
                $expired += $part['amount'];

                continue;
            }
            $refunded += $part['amount'];
            $shares[] = ['lot_id' => $part['lot_id'], 'amount' => $part['amount'], 'expires_at' => $expiresAt];
        }

        return new RefundPlan($refunded, $expired, $shares);
    }

    /** Écrit un lot `refund` par part du plan, chacun avec l'expiration de son lot d'origine. */
    public function applyRefund(PropertyBoost $boost, RefundPlan $plan, ?User $actor = null, ?string $reason = null): void
    {
        if ($plan->shares === []) {
            return;
        }
        $agency = Agency::withTrashed()->findOrFail($boost->agency_id);
        DB::transaction(function () use ($agency, $boost, $plan, $actor, $reason): void {
            foreach ($plan->shares as $share) {
                $this->grant($agency, CreditLotOrigin::Refund, $share['amount'], $share['expires_at'], $actor, $reason, $boost);
            }
        });
    }

    /** ADR-0061 §1 — un crédit (lot `admin_grant`) ou un débit (`admin_debit`) manuel, motivé. */
    public function adminAdjust(Agency $agency, int $amount, User $actor, string $reason, int $validityDays): ?CreditLot
    {
        if ($amount > 0) {
            return $this->grant($agency, CreditLotOrigin::AdminGrant, $amount, now()->addDays($validityDays), $actor, $reason);
        }

        $this->spend($agency, -$amount, CreditMovementType::AdminDebit, null, $actor, $reason);

        return null;
    }

    /** ADR-0061 §9 — solde chaque lot échu par un mouvement `expire`. Idempotent. Rend le nombre de lots expirés. */
    public function expireDue(): int
    {
        $count = 0;
        $agencyIds = CreditLot::query()
            ->where('remaining_amount', '>', 0)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->distinct()
            ->pluck('agency_id');

        foreach ($agencyIds as $agencyId) {
            DB::transaction(function () use ($agencyId, &$count): void {
                Agency::withTrashed()->whereKey($agencyId)->lockForUpdate()->first();
                $lots = CreditLot::query()
                    ->where('agency_id', $agencyId)
                    ->where('remaining_amount', '>', 0)
                    ->whereNotNull('expires_at')
                    ->where('expires_at', '<=', now())
                    ->get();
                foreach ($lots as $lot) {
                    $amount = $lot->remaining_amount;
                    $lot->forceFill(['remaining_amount' => 0])->save();
                    CreditMovement::record([
                        'agency_id' => $agencyId,
                        'credit_lot_id' => $lot->getKey(),
                        'type' => CreditMovementType::Expire,
                        'amount' => -$amount,
                    ]);
                    $count++;
                }
            });
        }

        return $count;
    }

    /**
     * Les lots qui violent l'invariant (ADR-0061 §2). Vide quand le registre est sain.
     *
     * @return list<int>
     */
    public function invariantViolations(?int $agencyId = null): array
    {
        return DB::table('credit_lots as l')
            ->leftJoin('credit_movements as m', 'm.credit_lot_id', '=', 'l.id')
            ->when($agencyId !== null, fn ($q) => $q->where('l.agency_id', $agencyId))
            ->groupBy('l.id', 'l.initial_amount', 'l.remaining_amount')
            ->havingRaw('l.initial_amount + COALESCE(SUM(CASE WHEN m.amount < 0 THEN m.amount ELSE 0 END), 0) <> l.remaining_amount')
            ->orHavingRaw('COALESCE(SUM(CASE WHEN m.amount > 0 THEN m.amount ELSE 0 END), 0) <> l.initial_amount')
            ->orHavingRaw('COUNT(CASE WHEN m.amount > 0 THEN 1 END) <> 1')
            ->orderBy('l.id')
            ->pluck('l.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
