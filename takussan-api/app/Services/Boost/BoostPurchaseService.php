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
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §5) — acheter (ou offrir) un boost. Prix et durée se figent dans la ligne
 * `property_boosts`. Tout se joue dans UNE transaction, sous le verrou de l'espace puis du bien :
 * deux achats simultanés sur le même bien se sérialisent (délai de Remontée, prolongation de Vedette).
 *
 * TCK-822 (P24.01) — une clé d'idempotence, unique par espace sur 24 h, rend un achat rejoué sans
 * second débit. Elle se lit et s'écrit SOUS le verrou de l'espace : deux rejeux simultanés se
 * sérialisent, et le second lit la clé que le premier a posée.
 */
final class BoostPurchaseService
{
    /** TCK-822 — la fenêtre pendant laquelle une clé d'idempotence rejoue l'achat qu'elle a fait. */
    public const IDEMPOTENCY_TTL_HOURS = 24;

    public function __construct(
        private readonly CreditLedger $ledger,
        private readonly BoostSettings $settings,
        private readonly BoostLifecycle $lifecycle,
    ) {}

    public function purchase(Property $property, BoostProduct $product, User $buyer): PropertyBoost
    {
        return $this->purchaseOnce($property, $product, $buyer, null)->boost;
    }

    /**
     * TCK-822 — acheter, ou rejouer l'achat qu'une même clé a déjà fait dans cet espace. La même clé
     * pour un autre bien ou une autre offre est refusée (422) : elle ne désigne pas le même achat.
     */
    public function purchaseOnce(Property $property, BoostProduct $product, User $buyer, ?string $idempotencyKey): BoostPurchaseResult
    {
        $this->assertHasSpace($property);

        try {
            return DB::transaction(function () use ($property, $product, $buyer, $idempotencyKey): BoostPurchaseResult {
                [$agency, $locked] = $this->lock($property);

                $cacheKey = $idempotencyKey === null ? null : $this->idempotencyCacheKey($agency, $idempotencyKey);
                if ($cacheKey !== null && ($replayed = $this->replay($cacheKey, $locked, $product)) !== null) {
                    return new BoostPurchaseResult($replayed, true);
                }

                // TCK-823 (P24.04) — jugés SOUS le verrou, sur les lignes verrouillées : une
                // dépublication ou un retrait d'offre écrit entre-temps ne passe plus.
                $this->assertProductActive($product);
                $this->assertPublic($locked);

                $boost = match ($product->kind) {
                    BoostKind::Bump => $this->bump($locked, $agency, $product, $buyer),
                    BoostKind::Featured => $this->featured($locked, $agency, $product, $buyer, false, null),
                    BoostKind::Badge => $this->badge($locked, $agency, $product, $buyer),
                };

                // Posée avant le COMMIT, sous le verrou : un rejeu qui attend le verrou la trouve. Si
                // la transaction échoue ensuite, la clé désigne une ligne qui n'existe pas, et
                // `replay()` l'ignore.
                if ($cacheKey !== null) {
                    Cache::put($cacheKey, [
                        'boost_id' => $boost->getKey(),
                        'property_id' => $locked->getKey(),
                        'product_id' => $product->getKey(),
                    ], now()->addHours(self::IDEMPOTENCY_TTL_HOURS));
                }

                return new BoostPurchaseResult($boost, false);
            });
        } catch (InsufficientCredits $e) {
            abort_code(422, 'credits.insufficient', ['missing' => $e->missing(), 'balance' => $e->balance]);
        }
    }

    private function idempotencyCacheKey(Agency $agency, string $idempotencyKey): string
    {
        return 'boost-purchase:'.$agency->getKey().':'.hash('sha256', $idempotencyKey);
    }

    private function replay(string $cacheKey, Property $property, BoostProduct $product): ?PropertyBoost
    {
        $seen = Cache::get($cacheKey);
        if (! is_array($seen)) {
            return null;
        }

        $boost = PropertyBoost::query()->find($seen['boost_id'] ?? null);
        if ($boost === null) {
            return null;
        }

        abort_code_unless(
            (int) ($seen['property_id'] ?? 0) === (int) $property->getKey() && (int) ($seen['product_id'] ?? 0) === (int) $product->getKey(),
            422,
            'boost.idempotency_key_reused',
        );

        return $boost;
    }

    /** ADR-0061 §5 — Vedette offerte par la plateforme : prix 0, auteur, motif, aucun mouvement. */
    public function offerFeatured(Property $property, BoostProduct $product, User $operator, string $reason): PropertyBoost
    {
        abort_code_unless($product->kind === BoostKind::Featured, 422, 'boost.offer_featured_only');
        $this->assertHasSpace($property);

        return DB::transaction(function () use ($property, $product, $operator, $reason): PropertyBoost {
            [$agency, $locked] = $this->lock($property);
            $this->assertPublic($locked);

            return $this->featured($locked, $agency, $product, $operator, true, $reason);
        });
    }

    private function assertHasSpace(Property $property): void
    {
        abort_code_if($property->agency_id === null, 422, 'boost.no_space');
    }

    /** Sous le verrou du bien : une dépublication attend la fin de l'achat, ou l'achat la voit. */
    private function assertPublic(Property $locked): void
    {
        // Le prédicat public est COMPOSÉ, jamais recopié : `scopePublic()` fait foi.
        abort_code_unless(Property::query()->public()->whereKey($locked->getKey())->exists(), 422, 'boost.property_not_public');
    }

    /** L'offre relue sous un verrou partagé : un retrait concurrent attend la fin de l'achat. */
    private function assertProductActive(BoostProduct $product): void
    {
        $active = BoostProduct::query()->whereKey($product->getKey())->sharedLock()->value('is_active');
        abort_code_unless((bool) $active, 422, 'boost.product_inactive');
    }

    /** @return array{0: Agency, 1: Property} */
    private function lock(Property $property): array
    {
        $agency = Agency::query()->whereKey($property->agency_id)->lockForUpdate()->firstOrFail();
        $locked = Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();

        return [$agency, $locked];
    }

    /**
     * TCK-824 (P24.02) — la fin du délai de Remontée en cours sur ce bien, `null` s'il n'y en a pas.
     * La même règle refuse l'achat (`bump()`) et s'annonce avant lui (`GET …/boosts`).
     */
    public function bumpAvailableAt(Property $property): ?CarbonInterface
    {
        $last = PropertyBoost::query()
            ->where('property_id', $property->getKey())
            ->where('kind', BoostKind::Bump)
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->first();
        $availableAt = $last?->starts_at->copy()->addHours($this->settings->bumpCooldownHours());

        return $availableAt !== null && $availableAt->isFuture() ? $availableAt : null;
    }

    private function bump(Property $property, Agency $agency, BoostProduct $product, User $buyer): PropertyBoost
    {
        $availableAt = $this->bumpAvailableAt($property);
        if ($availableAt !== null) {
            abort_code(422, 'boost.bump_cooldown', ['available_at' => $availableAt->toIso8601String()]);
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
