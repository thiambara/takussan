<?php

namespace App\Services\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\CreditMovementType;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §5) — acheter (ou offrir) un boost. Prix et durée se figent dans la ligne
 * `property_boosts`. Tout se joue dans UNE transaction, sous le verrou de l'espace puis du bien :
 * deux achats simultanés sur le même bien se sérialisent (délai de Remontée, prolongation de Vedette).
 */
final class BoostPurchaseService
{
    public function __construct(
        private readonly CreditLedger $ledger,
        private readonly BoostSettings $settings,
        private readonly BoostLifecycle $lifecycle,
    ) {}

    public function purchase(Property $property, BoostProduct $product, User $buyer): PropertyBoost
    {
        abort_code_unless($product->is_active, 422, 'boost.product_inactive');
        $this->assertBoostable($property);

        try {
            return DB::transaction(function () use ($property, $product, $buyer): PropertyBoost {
                [$agency, $locked] = $this->lock($property);

                return match ($product->kind) {
                    BoostKind::Bump => $this->bump($locked, $agency, $product, $buyer),
                    BoostKind::Featured => $this->featured($locked, $agency, $product, $buyer, false, null),
                    BoostKind::Badge => $this->badge($locked, $agency, $product, $buyer),
                };
            });
        } catch (InsufficientCredits $e) {
            abort_code(422, 'credits.insufficient', ['missing' => $e->missing(), 'balance' => $e->balance]);
        }
    }

    /** ADR-0061 §5 — Vedette offerte par la plateforme : prix 0, auteur, motif, aucun mouvement. */
    public function offerFeatured(Property $property, BoostProduct $product, User $operator, string $reason): PropertyBoost
    {
        abort_code_unless($product->kind === BoostKind::Featured, 422, 'boost.offer_featured_only');
        $this->assertBoostable($property);

        return DB::transaction(function () use ($property, $product, $operator, $reason): PropertyBoost {
            [$agency, $locked] = $this->lock($property);

            return $this->featured($locked, $agency, $product, $operator, true, $reason);
        });
    }

    private function assertBoostable(Property $property): void
    {
        abort_code_if($property->agency_id === null, 422, 'boost.no_space');
        // Le prédicat public est COMPOSÉ, jamais recopié : `scopePublic()` fait foi.
        abort_code_unless(Property::query()->public()->whereKey($property->getKey())->exists(), 422, 'boost.property_not_public');
    }

    /** @return array{0: Agency, 1: Property} */
    private function lock(Property $property): array
    {
        $agency = Agency::query()->whereKey($property->agency_id)->lockForUpdate()->firstOrFail();
        $locked = Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();

        return [$agency, $locked];
    }

    private function bump(Property $property, Agency $agency, BoostProduct $product, User $buyer): PropertyBoost
    {
        $cooldown = $this->settings->bumpCooldownHours();
        $last = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('kind', BoostKind::Bump)
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->first();
        if ($last !== null && $last->starts_at->copy()->addHours($cooldown)->isFuture()) {
            abort_code(422, 'boost.bump_cooldown', ['available_at' => $last->starts_at->copy()->addHours($cooldown)->toIso8601String()]);
        }

        // Une Remontée est instantanée : sa ligne naît close, et n'est jamais remboursée.
        $boost = PropertyBoost::query()->create([
            'property_id' => $property->getKey(),
            'agency_id' => $agency->getKey(),
            'boost_product_id' => $product->getKey(),
            'kind' => BoostKind::Bump,
            'price_credits' => $product->price_credits,
            'duration_days' => 0,
            'starts_at' => now(),
            'ends_at' => now(),
            'ended_at' => now(),
            'status' => BoostStatus::Ended,
            'purchased_by_id' => $buyer->getKey(),
        ]);
        $this->debit($agency, $product->price_credits, $boost, $buyer);
        $this->lifecycle->writeProperty($property, ['ranked_at' => now()]);

        return $boost;
    }

    private function featured(Property $property, Agency $agency, BoostProduct $product, User $actor, bool $offered, ?string $reason): PropertyBoost
    {
        $price = $offered ? 0 : $product->price_credits;
        $current = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('kind', BoostKind::Featured)
            ->whereIn('status', BoostStatus::live())
            ->lockForUpdate()
            ->first();

        if ($current !== null) {
            // ADR-0061 §5 : pas de cumul — on PROLONGE la Vedette en place. Une Vedette échue que le
            // tick n'a pas encore close est encore `active` : la prolongation part alors de
            // MAINTENANT, jamais d'une fin déjà passée (le temps écoulé serait payé et non servi).
            $seconds = $product->duration_days * 86400;
            $from = $current->ends_at !== null && $current->ends_at->isFuture() ? $current->ends_at->copy() : now();
            $current->forceFill([
                'price_credits' => $current->price_credits + $price,
                'duration_days' => $current->duration_days + $product->duration_days,
                'ends_at' => $current->status === BoostStatus::Active ? $from->addSeconds($seconds) : null,
                'remaining_seconds' => $current->status === BoostStatus::Paused ? (int) $current->remaining_seconds + $seconds : null,
                'offered' => $current->offered && $offered,
            ])->save();
            $boost = $current;
        } else {
            $boost = PropertyBoost::query()->create([
                'property_id' => $property->getKey(),
                'agency_id' => $agency->getKey(),
                'boost_product_id' => $product->getKey(),
                'kind' => BoostKind::Featured,
                'price_credits' => $price,
                'duration_days' => $product->duration_days,
                'starts_at' => now(),
                'ends_at' => now()->addDays($product->duration_days),
                'status' => BoostStatus::Active,
                'offered' => $offered,
                'offer_reason' => $reason,
                'purchased_by_id' => $actor->getKey(),
            ]);
        }

        $this->debit($agency, $price, $boost, $actor);
        $this->lifecycle->project($property);

        return $boost;
    }

    private function badge(Property $property, Agency $agency, BoostProduct $product, User $buyer): PropertyBoost
    {
        // ADR-0061 §5 : un seul badge actif ; le nouveau remplace l'ancien, sans remboursement.
        PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('kind', BoostKind::Badge)
            ->whereIn('status', BoostStatus::live())
            ->update(['status' => BoostStatus::Ended->value, 'ended_at' => now(), 'remaining_seconds' => null, 'updated_at' => now()]);

        $boost = PropertyBoost::query()->create([
            'property_id' => $property->getKey(),
            'agency_id' => $agency->getKey(),
            'boost_product_id' => $product->getKey(),
            'kind' => BoostKind::Badge,
            'variant' => $product->variant,
            'price_credits' => $product->price_credits,
            'duration_days' => $product->duration_days,
            'starts_at' => now(),
            'ends_at' => now()->addDays($product->duration_days),
            'status' => BoostStatus::Active,
            'purchased_by_id' => $buyer->getKey(),
        ]);
        $this->debit($agency, $product->price_credits, $boost, $buyer);
        $this->lifecycle->project($property);

        return $boost;
    }

    private function debit(Agency $agency, int $price, PropertyBoost $boost, User $actor): void
    {
        if ($price > 0) {
            $this->ledger->spend($agency, $price, CreditMovementType::Spend, $boost, $actor);
        }
    }
}
