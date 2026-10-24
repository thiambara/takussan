<?php

namespace App\Services\Boost;

use App\Models\Property;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Laravel\Scout\ModelObserver;

/**
 * TCK-633 lot F (ADR-0061 §5) — `featured` est désormais DÉRIVÉ des boosts. Un `featured = true`
 * hérité sans boost devient une Vedette offerte de 30 jours (prix 0, aucun mouvement) ; sans espace,
 * aucun boost n'est possible et la vedette tombe. Idempotent.
 *
 * TCK-2208 (P122.04) — les écritures passent par `DB::table()`, que l'observateur de Scout ne voit
 * pas : les biens touchés se réindexent à la fin (`takussan-api/CLAUDE.md` § Recherche). Sans cela,
 * un bien sans agence gardait `featured = true` dans l'index, et le vivier des vedettes le servait.
 */
final class LegacyFeaturedConversion
{
    public const DAYS = 30;

    public const REASON = 'ADR-0061 : mise en avant antérieure convertie en Vedette offerte';

    public function run(): int
    {
        $now = now();
        $count = 0;
        $touches = [];
        $productId = DB::table('boost_products')->where('kind', 'featured')->where('duration_days', self::DAYS)->value('id');

        DB::table('properties')
            ->where('featured', true)
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('property_boosts')
                ->whereColumn('property_boosts.property_id', 'properties.id')
                ->where('property_boosts.kind', 'featured')
                ->whereIn('property_boosts.status', ['active', 'paused']))
            ->orderBy('id')
            ->select(['id', 'agency_id'])
            ->chunkById(200, function ($properties) use ($now, $productId, &$count, &$touches): void {
                foreach ($properties as $p) {
                    $touches[] = (int) $p->id;
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

        $this->reindexer($touches);

        return $count;
    }

    /**
     * Même forme que `GeoReindexation::ecrire()` ; suit la synchronisation des modèles, comme
     * `Property::reindexer()` : coupée (suite hors recherche, seed sous moteur coupé), elle ne fait rien.
     *
     * @param  list<int>  $ids
     */
    private function reindexer(array $ids): void
    {
        if ($ids === [] || ModelObserver::syncingDisabledFor(Property::class)) {
            return;
        }

        Property::query()
            ->with('address', 'tagsVisibles', 'agency')
            ->whereKey($ids)
            ->chunkById(200, function (Collection $biens): void {
                $biens->filter->shouldBeSearchable()->searchable();
                $biens->reject->shouldBeSearchable()->unsearchable();
            });
    }
}
