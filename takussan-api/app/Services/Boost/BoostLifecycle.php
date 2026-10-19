<?php

namespace App\Services\Boost;

use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyBoostTranche;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Notifications\Boost\BoostRefundedNotification;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\RefundPlan;
use App\Services\Lead\ContactLeadService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Laravel\Scout\ModelObserver;

/**
 * TCK-633 lot F (ADR-0061 §5, §8, §9) — le SEUL écrivain des projections d'un bien (`featured`,
 * `sponsored_until`, `badge`, `badge_until`) et du cycle de vie des boosts. Chaque transition de
 * clôture se RÉCLAME par un `UPDATE … WHERE status IN (live)` : deux passages concurrents (observateur
 * et tick) n'en appliquent qu'un, et ne remboursent qu'une fois.
 */
final class BoostLifecycle
{
    private const DAY = 86400;

    public function __construct(private readonly CreditLedger $ledger) {}

    /** ADR-0061 §8 — rejoue les règles pour un bien. Idempotent. Rend le nombre de boosts touchés. */
    public function reconcile(Property $property, ?User $actor = null): int
    {
        if (! $property->exists) {
            return 0;
        }
        $boosts = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->whereIn('status', BoostStatus::live())
            ->get();
        if ($boosts->isEmpty()) {
            return 0;
        }

        $touched = 0;
        if ($property->platform_hold_at !== null) {
            // Modération (verrou plateforme, signalement retenu) : fin, rien de remboursé.
            foreach ($boosts as $boost) {
                $touched += $this->end($boost) ? 1 : 0;
            }
        } elseif ($property->trashed() || in_array($property->status, [PropertyStatus::Rented, PropertyStatus::Sold], true)) {
            foreach ($boosts as $boost) {
                $this->closeWithRefund($boost, $actor, null, cancelled: false, anyKind: false);
                $touched++;
            }
        } else {
            $public = Property::query()->public()->whereKey($property->getKey())->exists();
            foreach ($boosts as $boost) {
                if (! $public && $boost->status === BoostStatus::Active) {
                    $touched += $this->pause($boost) ? 1 : 0;
                } elseif ($public && $boost->status === BoostStatus::Paused) {
                    $touched += $this->resume($boost) ? 1 : 0;
                }
            }
        }

        $this->project($property);

        return $touched;
    }

    /** ADR-0061 §9 — clôt les Vedettes et Badges échus. Idempotent. */
    public function endExpired(): int
    {
        $count = 0;
        $due = PropertyBoost::query()
            ->where('status', BoostStatus::Active)
            ->whereNotNull('ends_at')
            ->where('ends_at', '<=', now())
            ->whereIn('kind', [BoostKind::Featured, BoostKind::Badge])
            ->get();

        foreach ($due as $boost) {
            if (! $this->end($boost)) {
                continue;
            }
            $count++;
            $property = Property::withTrashed()->find($boost->property_id);
            if ($property !== null) {
                $this->project($property);
            }
        }

        return $count;
    }

    /** ADR-0061 §9 — filet de sécurité : rejoue `reconcile()` pour tout bien qui porte un boost vivant. */
    public function reconcileAll(): int
    {
        $touched = 0;
        Property::withTrashed()
            ->whereIn('id', PropertyBoost::query()->whereIn('status', BoostStatus::live())->select('property_id'))
            ->chunkById(100, function (Collection $properties) use (&$touched): void {
                foreach ($properties as $property) {
                    $touched += $this->reconcile($property);
                }
            });

        return $touched;
    }

    /** ADR-0061 §5, AC16 — annulation par la plateforme, avec ou sans remboursement. */
    public function cancel(PropertyBoost $boost, bool $refund, User $operator, string $reason): PropertyBoost
    {
        abort_code_unless(in_array($boost->status, BoostStatus::live(), true), 422, 'boost.not_live');

        DB::transaction(function () use ($boost, $refund, $operator, $reason): void {
            if ($refund) {
                $this->closeWithRefund($boost, $operator, $reason, cancelled: true, anyKind: true);
            } else {
                PropertyBoost::query()->whereKey($boost->getKey())->whereIn('status', $this->liveValues())->update([
                    'status' => BoostStatus::Cancelled->value, 'ended_at' => now(), 'remaining_seconds' => null,
                    'cancel_reason' => $reason, 'cancelled_by_id' => $operator->getKey(), 'updated_at' => now(),
                ]);
            }
            $property = Property::withTrashed()->find($boost->property_id);
            if ($property !== null) {
                $this->project($property);
            }
        });

        return $boost->fresh();
    }

    /**
     * Jours PLEINS restants, au prorata du prix figé (ADR-0061 §8) — et, depuis l'amendement du
     * 2026-10-18 (TCK-942), tranche par tranche : les jours restants sont les plus tardifs, donc ceux
     * des dernières tranches, et chacun se rend au prix de la tranche qui l'a acheté. Une tranche
     * offerte ne rend rien. Le prix cumulé étalé sur la durée cumulée rendait 6 crédits sur les 20
     * d'une Vedette offerte 30 j puis achetée 7 j, louée au 25ᵉ jour.
     */
    public function refundableCredits(PropertyBoost $boost): int
    {
        if ($boost->duration_days <= 0 || $boost->price_credits <= 0) {
            return 0;
        }
        $seconds = match ($boost->status) {
            BoostStatus::Active => max(0, ($boost->ends_at?->getTimestamp() ?? 0) - now()->getTimestamp()),
            BoostStatus::Paused => (int) $boost->remaining_seconds,
            default => 0,
        };
        $fullDays = min(intdiv($seconds, self::DAY), $boost->duration_days);

        $credits = 0;
        foreach (array_reverse($this->tranchesOf($boost)) as [$price, $days]) {
            if ($fullDays <= 0) {
                break;
            }
            $taken = min($fullDays, $days);
            $credits += intdiv($price * $taken, $days);
            $fullDays -= $taken;
        }

        return $credits;
    }

    /**
     * TCK-942 — `[prix, durée]` de chaque tranche, par rang. Un boost sans tranche (Badge, Vedette
     * prolongée avant les tranches, Vedette convertie par `LegacyFeaturedConversion`) est sa propre
     * tranche unique, au prix et à la durée de sa ligne : la reprise de l'amendement.
     *
     * @return list<array{0: int, 1: int}>
     */
    private function tranchesOf(PropertyBoost $boost): array
    {
        $tranches = $boost->tranches()->get(['price_credits', 'duration_days']);
        if ($tranches->isEmpty()) {
            return [[$boost->price_credits, $boost->duration_days]];
        }

        return $tranches->map(fn (PropertyBoostTranche $t) => [$t->price_credits, $t->duration_days])->values()->all();
    }

    public function project(Property $property): void
    {
        if (! $property->exists) {
            return;
        }
        $actifs = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('status', BoostStatus::Active)
            ->whereIn('kind', [BoostKind::Featured, BoostKind::Badge])
            ->get();
        $vedette = $actifs->first(fn (PropertyBoost $b) => $b->kind === BoostKind::Featured);
        $badge = $actifs->first(fn (PropertyBoost $b) => $b->kind === BoostKind::Badge);

        $this->writeProperty($property, [
            'featured' => $vedette !== null,
            'sponsored_until' => $vedette?->ends_at,
            'badge' => $badge?->variant,
            'badge_until' => $badge?->ends_at,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    public function writeProperty(Property $property, array $attributes): void
    {
        if (! $property->exists) {
            return;
        }
        // La comparaison se fait contre la LIGNE, jamais contre l'instance reçue : celle d'un
        // observateur ou d'un appelant peut avoir été chargée avant l'achat du boost, et son
        // `featured = false` périmé rendrait « rien à écrire » quand la base porte `true`.
        $fresh = Property::withTrashed()->whereKey($property->getKey())->first();
        if ($fresh === null) {
            return;
        }
        $fresh->forceFill($attributes);
        $changed = $fresh->isDirty();
        if ($changed) {
            $fresh->saveQuietly();
        }

        // L'instance de l'appelant suit la ligne, sans se croire modifiée.
        $keys = array_keys($attributes);
        $property->forceFill($fresh->only($keys))->syncOriginalAttributes($keys);

        if (! $changed || ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }
        $fresh->shouldBeSearchable() ? $fresh->searchable() : $fresh->unsearchable();
    }

    /**
     * P05.08 (TCK-941) — réclamée par `UPDATE … WHERE`, comme `end()` : un passage qui a lu le boost
     * avant qu'un autre ne le close ou ne le reprenne n'écrit rien. Sans quoi une pause ranimait un
     * boost clos, et une reprise rejouée rendait le temps déjà couru. La réclamation porte aussi
     * sur la valeur lue dont dépend l'écriture (`ends_at` pour la pause, `remaining_seconds` pour la
     * reprise) : une ligne revenue au même statut avec une autre fin (cas ABA : reprise, prolongation)
     * n'est pas écrite sur une valeur périmée. Rend false si la transition a été perdue ; le passage
     * suivant la rejoue sur la ligne à jour.
     */
    private function pause(PropertyBoost $boost): bool
    {
        $remaining = max(0, ($boost->ends_at?->getTimestamp() ?? 0) - now()->getTimestamp());

        return $this->claimTransition($boost, BoostStatus::Active, 'ends_at', [
            'status' => BoostStatus::Paused, 'remaining_seconds' => $remaining, 'paused_at' => now(), 'ends_at' => null,
        ]);
    }

    private function resume(PropertyBoost $boost): bool
    {
        return $this->claimTransition($boost, BoostStatus::Paused, 'remaining_seconds', [
            'status' => BoostStatus::Active, 'ends_at' => now()->addSeconds((int) $boost->remaining_seconds),
            'remaining_seconds' => null, 'paused_at' => null,
        ]);
    }

    /**
     * Écrit la transition si la ligne est toujours dans l'état `$from` lu ET porte encore la valeur lue
     * de `$readColumn` ; l'instance suit la ligne dans les deux cas.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function claimTransition(PropertyBoost $boost, BoostStatus $from, string $readColumn, array $attributes): bool
    {
        $read = $boost->getRawOriginal($readColumn);
        $boost->forceFill($attributes);
        $claimed = PropertyBoost::query()->whereKey($boost->getKey())->where('status', $from->value)
            ->when($read === null, fn ($q) => $q->whereNull($readColumn), fn ($q) => $q->where($readColumn, $read))
            ->update($boost->getDirty() + ['updated_at' => now()]);
        if ($claimed === 0) {
            $boost->refresh();

            return false;
        }
        $boost->syncOriginal();

        return true;
    }

    /** Clôt sans remboursement. Rend false si un autre passage l'avait déjà clos. */
    private function end(PropertyBoost $boost): bool
    {
        $claimed = PropertyBoost::query()->whereKey($boost->getKey())->whereIn('status', $this->liveValues())->update([
            'status' => BoostStatus::Ended->value, 'ended_at' => now(), 'remaining_seconds' => null, 'updated_at' => now(),
        ]);
        if ($claimed === 0) {
            return false;
        }
        if ($boost->kind !== BoostKind::Bump) {
            $this->notify($boost, new BoostEndedNotification($boost->property_id, $this->title($boost)));
        }

        return true;
    }

    /**
     * Clôt en remboursant les jours pleins restants. Automatique : Vedette seulement (`anyKind` faux) ;
     * annulation par la plateforme : tout genre (`anyKind` vrai).
     */
    private function closeWithRefund(PropertyBoost $boost, ?User $actor, ?string $reason, bool $cancelled, bool $anyKind): int
    {
        $amount = ($anyKind || $boost->kind === BoostKind::Featured) ? $this->refundableCredits($boost) : 0;

        // ADR-0061 §4 : la répartition par lot d'origine est calculée AVANT la réclamation, pour que
        // le statut et `refunded_credits` disent ce qui est RÉELLEMENT rendu — une part payée par un
        // lot déjà expiré ne l'est pas. Réclamation et écriture des lots vont ensemble.
        $plan = DB::transaction(function () use ($boost, $actor, $reason, $cancelled, $amount): ?RefundPlan {
            $plan = $this->ledger->refundPlan($boost, $amount);
            $status = $plan->refunded > 0 ? BoostStatus::Refunded : ($cancelled ? BoostStatus::Cancelled : BoostStatus::Ended);

            $claimed = PropertyBoost::query()->whereKey($boost->getKey())->whereIn('status', $this->liveValues())->update([
                'status' => $status->value,
                'ended_at' => now(),
                'remaining_seconds' => null,
                'refunded_credits' => $plan->refunded,
                'cancel_reason' => $cancelled ? $reason : null,
                'cancelled_by_id' => $cancelled ? $actor?->getKey() : null,
                'updated_at' => now(),
            ]);
            if ($claimed === 0) {
                return null;
            }
            $this->ledger->applyRefund($boost, $plan, $actor, $reason);

            return $plan;
        });
        if ($plan === null) {
            return 0;
        }

        $this->notify($boost, $plan->refunded > 0
            ? new BoostRefundedNotification($boost->property_id, $this->title($boost), $plan->refunded, $plan->expired)
            : new BoostEndedNotification($boost->property_id, $this->title($boost)));

        return $plan->refunded;
    }

    /** @return list<string> */
    private function liveValues(): array
    {
        return array_map(fn (BoostStatus $s) => $s->value, BoostStatus::live());
    }

    private function title(PropertyBoost $boost): string
    {
        return (string) Property::withTrashed()->whereKey($boost->property_id)->value('title');
    }

    /** Aux admins actifs de l'espace, et à l'acheteur s'il n'en est pas. */
    private function notify(PropertyBoost $boost, object $notification): void
    {
        $recipients = app(ContactLeadService::class)->agencyAdmins($boost->agency_id);
        if ($boost->purchased_by_id !== null && ! $boost->offered) {
            $buyer = User::query()->find($boost->purchased_by_id);
            if ($buyer !== null) {
                $recipients->push($buyer);
            }
        }
        foreach ($recipients->unique('id') as $user) {
            $user->notify($notification);
        }
    }
}
