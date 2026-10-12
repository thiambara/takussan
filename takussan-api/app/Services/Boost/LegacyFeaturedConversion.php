<?php

namespace App\Services\Boost;

use Illuminate\Support\Facades\DB;

/**
 * TCK-633 lot F (ADR-0061 §5) — `featured` est désormais DÉRIVÉ des boosts. Un `featured = true`
 * hérité sans boost devient une Vedette offerte de 30 jours (prix 0, aucun mouvement) ; sans espace,
 * aucun boost n'est possible et la vedette tombe. Idempotent.
 */
final class LegacyFeaturedConversion
{
    public const DAYS = 30;

    public const REASON = 'ADR-0061 : mise en avant antérieure convertie en Vedette offerte';

    public function run(): int
    {
        $now = now();
        $count = 0;
        $productId = DB::table('boost_products')->where('kind', 'featured')->where('duration_days', self::DAYS)->value('id');

        DB::table('properties')
            ->where('featured', true)
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('property_boosts')
                ->whereColumn('property_boosts.property_id', 'properties.id')
                ->where('property_boosts.kind', 'featured')
                ->whereIn('property_boosts.status', ['active', 'paused']))
            ->orderBy('id')
            ->select(['id', 'agency_id'])
            ->chunkById(200, function ($properties) use ($now, $productId, &$count): void {
                foreach ($properties as $p) {
                    if ($p->agency_id === null) {
                        DB::table('properties')->where('id', $p->id)->update(['featured' => false, 'sponsored_until' => null]);

                        continue;
                    }
                    $endsAt = $now->copy()->addDays(self::DAYS);
                    DB::table('property_boosts')->insert([
                        'property_id' => $p->id, 'agency_id' => $p->agency_id, 'boost_product_id' => $productId,
                        'kind' => 'featured', 'variant' => null, 'price_credits' => 0, 'duration_days' => self::DAYS,
                        'starts_at' => $now, 'ends_at' => $endsAt, 'status' => 'active', 'offered' => true,
                        'offer_reason' => self::REASON, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                    DB::table('properties')->where('id', $p->id)->update(['sponsored_until' => $endsAt]);
                    $count++;
                }
            });

        return $count;
    }
}
